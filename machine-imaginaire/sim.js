/* Machine Imaginaire: the pictures. Generative pictures after artists who worked by rules:
   Ellsworth Kelly and Sol LeWitt (a grid dealt out by chance), Vera Molnár (the disrupted
   grid), Georg Nees (gravel), François Morellet (superimposed line grids), Victor Vasarely
   (the bulging grid), Bridget Riley (wave stripes), Tyler Hobbs (flow fields), Casey Reas
   (process) and Ken Knowlton (the mosaic).

   Every picture is a pure function of four things: the seed, the style, that style's
   settings, and the palette. The palette comes either from the seed or from a photo the
   visitor drops in, analysed here from its pixels (k-means for the five main colours and
   their shares, a 16x10 map of light and dark and an 80x50 tone map) and kept in a
   quantised "canonical" form, the same one the share link carries, so a link renders
   exactly what was on screen.

   Each style builds a scene once, every random decision made up front, and then paints it
   with paint(ctx, t, upto): the frame at time t with the first `upto` pieces in place.
   Movement is a function of t too. No page access: ctx is whatever it is handed (a
   canvas, the SVG stand-in, or a recorder in a test), so pictures can be made in Node:

     const mi = createMachine({ makeCanvas, rnd })
       makeCanvas  makeCanvas(w, h): an offscreen canvas, and makePath() a Path2D (only
                   Reas's process needs them)
       rnd         the dice for a fresh seed's name

   mi.S is the seed, style, settings and photo; buildScene() makes the picture. */

export function createMachine({ makeCanvas = () => { throw new Error('no canvas here'); }, makePath = () => { throw new Error('no Path2D here'); }, rnd } = {}) {
  // ---------- constants ----------
  const W = 2400, H = 1500;
  const LUM_COLS = 16, LUM_ROWS = 10;
  const TONE_COLS = 80, TONE_ROWS = 50;
  const ANALYSE_MAX = 240;          // a photo is shrunk to this long side before analysis
  const K = 5;
  const TAU = Math.PI * 2;
  const PI_DIGITS = '3141592653589793238462643383279502884197169399375105820974944592307816406286208998628034825342117067982148086513282306647';

  // ---------- seeded randomness ----------
  let R = rnd || Math.random;      // only for a fresh seed's name; every picture runs on rngFor
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
  // a standard normal, by Box–Muller
  function gauss(rng) {
    let u = 0;
    while (!u) u = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rng());
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
  const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
  const ramp = (t, s) => Math.min(1, t / s);     // movement eases in from the still picture
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
  const contrasting = (list, c) => list.reduce((a, b) => (Math.abs(luma(b.rgb) - luma(c.rgb)) > Math.abs(luma(a.rgb) - luma(c.rgb)) ? b : a));
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
  const validMap = (s, n) => (typeof s === 'string' && s.length === n && /^[0-9a-f]+$/.test(s) ? s : null);

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
  // always gives the same palette whatever the picture's seed), then the light and
  // tone maps, which read the centre of the photo cropped to the picture's shape.
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

    let cx0 = 0, cy0 = 0, cw = w, ch = h;
    if (w / h > W / H) { cw = h * W / H; cx0 = (w - cw) / 2; } else { ch = w * H / W; cy0 = (h - ch) / 2; }
    const lightMap = (cols, rows) => {
      let out = '';
      for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
        const x0 = Math.floor(cx0 + gx * cw / cols), x1 = Math.max(x0 + 1, Math.floor(cx0 + (gx + 1) * cw / cols));
        const y0 = Math.floor(cy0 + gy * ch / rows), y1 = Math.max(y0 + 1, Math.floor(cy0 + (gy + 1) * ch / rows));
        let s = 0, c = 0;
        for (let y = y0; y < y1 && y < h; y++) for (let x = x0; x < x1 && x < w; x++) {
          const i = (y * w + x) * 4;
          s += luma([data[i], data[i + 1], data[i + 2]]); c++;
        }
        out += Math.round((c ? s / c : 128) / 255 * 15).toString(16);
      }
      return out;
    };
    return { palette, lum: lightMap(LUM_COLS, LUM_ROWS), tone: lightMap(TONE_COLS, TONE_ROWS) };
  }

  // A map of hex digits read back as a smooth 0..1 field over the picture.
  function mapSampler(str, cols, rows) {
    const g = Array.from(str, (c) => parseInt(c, 16) / 15);
    return (u, v) => {
      const x = clamp(u * cols - 0.5, 0, cols - 1), y = clamp(v * rows - 0.5, 0, rows - 1);
      const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(cols - 1, x0 + 1), y1 = Math.min(rows - 1, y0 + 1);
      const fx = x - x0, fy = y - y0, at = (a, b) => g[b * cols + a];
      return (at(x0, y0) * (1 - fx) + at(x1, y0) * fx) * (1 - fy) + (at(x0, y1) * (1 - fx) + at(x1, y1) * fx) * fy;
    };
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

  // A ribbon along n points (flat x,y pairs), fattest in the middle, tapering to both ends.
  // A ribbon cut short by an edge keeps the taper of the whole: point i sits at k0 + i of full.
  function ribbon(ctx, pts, n, width, col, k0 = 0, full = n, mult = null) {
    if (n < 2) return;
    ctx.fillStyle = col;
    ctx.beginPath();
    const side = (sgn, i) => {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      const nx = -(pts[b * 2 + 1] - pts[a * 2 + 1]), ny = pts[b * 2] - pts[a * 2];
      const l = Math.hypot(nx, ny) || 1;
      const hw = width / 2 * (0.3 + 0.7 * Math.pow(Math.max(0, Math.sin(Math.PI * (k0 + i) / (full - 1))), 0.6)) * sgn * (mult ? mult[i] : 1);
      return [pts[i * 2] + nx / l * hw, pts[i * 2 + 1] + ny / l * hw];
    };
    for (let i = 0; i < n; i++) { const p = side(1, i); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }
    for (let i = n - 1; i >= 0; i--) { const p = side(-1, i); ctx.lineTo(p[0], p[1]); }
    ctx.closePath();
    ctx.fill();
  }

  // Reas's process accumulates, so its scene paints into this and copies it out.
  let reasCanvas = null;

  // ---------- the styles ----------
  // Each build(R) gets R = { rng, rngA, noise, P, ground, inks, prm, lumAt, toneAt } —
  // rng for the picture, rngA for how it moves — and returns a scene:
  // { total, info, paint(ctx, t, upto) }.
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
      build({ rng, rngA, P, prm }) {
        const cols = prm.grid, rows = Math.max(1, Math.round(cols * H / W)), cells = cols * rows;
        const counts = allocate(P, cells);
        const deck = [];
        counts.forEach((c, i) => { for (let k = 0; k < c; k++) deck.push(i); });
        shuffle(deck, rng);
        const paper = rgbToHex(mix(lightest(P).rgb, [255, 255, 255], 0.55));
        const ink0 = darkest(P);
        const cw = W / cols, ch = H / rows, g = prm.gap;
        const lw = Math.max(1.5, prm.line * 0.28);
        // A panel is a colour and, for LeWitt, its lines; it keeps them when it moves.
        const panels = deck.map((ci) => {
          const col = P[ci];
          const lines = prm.fill === 'lines' || (prm.fill === 'both' && rng() < 0.5);
          if (!lines) return { col, lines };
          const ink = Math.abs(luma(col.rgb) - luma(hexToRgb(paper))) < 60 ? ink0 : col;
          const d1 = Math.floor(rng() * 4);
          const d2 = rng() < 0.35 ? (d1 + 1 + Math.floor(rng() * 3)) % 4 : -1;
          return { col, lines, ink, d1, d2 };
        });
        const order = shuffle(Array.from({ length: cells }, (_, i) => i), rng);   // the order they are dealt in
        // How much a panel belongs underneath: the less colour in it the more, and then the
        // lighter. LeWitt's line panels are mostly paper, so they count as white.
        const chroma = (rgb) => Math.max(...rgb) - Math.min(...rgb);
        const under = (p) => (p.lines ? 1000 : -chroma(p.col.rgb) * 4 + luma(p.col.rgb));
        const cellXY = (c) => [(c % cols) * cw, Math.floor(c / cols) * ch];
        function drawPanel(ctx, p, x, y, sc) {
          const w = (cw - g) * sc, h = (ch - g) * sc;
          x += g / 2 + (cw - g - w) / 2; y += g / 2 + (ch - g - h) / 2;
          if (!p.lines) { ctx.fillStyle = p.col.hex; ctx.fillRect(x, y, w + (g ? 0 : 0.6), h + (g ? 0 : 0.6)); return; }
          ctx.fillStyle = paper; ctx.fillRect(x, y, w, h);
          hatch(ctx, x, y, w, h, p.d1, prm.line, lw, p.ink.hex);
          if (p.d2 >= 0) hatch(ctx, x, y, w, h, p.d2, prm.line, lw, p.ink.hex);
        }

        // Moving: every IV seconds two neighbouring panels trade places over DUR seconds,
        // each by the shortest way, straight across, one sliding over the other: the white
        // or grey one always underneath. Over the picture's ground colour, at full size,
        // without shadow (Amber's calls). The schedule comes from its own seeded stream and is planned lazily
        // in order, so the frame at any time t is always the same.
        const IV = 0.3, DUR = 1.2;
        const swaps = [];
        const planned = Array.from({ length: cells }, (_, i) => i);   // the deck with every planned swap done
        const neighbours = (c) => {
          const x = c % cols, y = Math.floor(c / cols), out = [];
          if (x) out.push(c - 1);
          if (x < cols - 1) out.push(c + 1);
          if (y) out.push(c - cols);
          if (y < rows - 1) out.push(c + cols);
          return out;
        };
        function plan(k) {
          while (swaps.length <= k) {
            const j = swaps.length, start = j * IV, busy = new Set();
            for (let i = Math.max(0, j - Math.ceil(DUR / IV) - 1); i < j; i++) {
              const s = swaps[i];
              if (s && i * IV + DUR > start) { busy.add(s[0]); busy.add(s[1]); }
            }
            let pick = null;
            for (let tries = 0; tries < 12 && !pick && cells > 1; tries++) {
              const a = Math.floor(rngA() * cells);
              if (busy.has(a)) continue;
              const nb = neighbours(a).filter((b) => !busy.has(b));
              if (!nb.length) continue;
              const diff = nb.filter((b) => panels[planned[b]].col !== panels[planned[a]].col);
              const list = diff.length ? diff : nb;
              pick = [a, list[Math.floor(rngA() * list.length)]];
            }
            if (pick) { const s = planned[pick[0]]; planned[pick[0]] = planned[pick[1]]; planned[pick[1]] = s; }
            swaps.push(pick);
          }
        }
        const fresh = () => ({ applied: 0, at: Array.from({ length: cells }, (_, i) => i) });
        let sim = fresh();
        function stateAt(t) {
          if (t <= 0) { sim = fresh(); return { at: sim.at, active: [] }; }
          const applied = t < DUR ? 0 : Math.floor((t - DUR) / IV) + 1;    // finished by t
          const last = Math.floor(t / IV);                                  // the latest one started
          plan(last);
          if (applied < sim.applied) sim = fresh();
          for (; sim.applied < applied; sim.applied++) {
            const s = swaps[sim.applied];
            if (s) { const a = sim.at, x = a[s[0]]; a[s[0]] = a[s[1]]; a[s[1]] = x; }
          }
          const active = [];
          for (let k = applied; k <= last; k++) if (swaps[k]) active.push([swaps[k], (t - k * IV) / DUR]);
          return { at: sim.at, active };
        }

        return {
          total: cells,
          info: { cells, counts, deck },
          paint(ctx, t, upto) {
            const n = Math.min(cells, Math.floor(upto));
            const back = g > 0 || n < cells ? paper : P[0].hex;
            ctx.fillStyle = back;
            ctx.fillRect(0, 0, W, H);
            const { at, active } = stateAt(t);
            const moving = new Set();
            active.forEach(([s]) => { moving.add(s[0]); moving.add(s[1]); });
            for (let k = 0; k < n; k++) {
              const c = order[k];
              if (moving.has(c)) continue;
              const [x, y] = cellXY(c);
              drawPanel(ctx, panels[at[c]], x, y, 1);
            }
            if (!active.length) return;
            ctx.fillStyle = back;           // what they leave behind is the picture's own ground
            active.forEach(([[a, b]]) => { [a, b].forEach((c) => { const [x, y] = cellXY(c); ctx.fillRect(x, y, cw + 0.6, ch + 0.6); }); });
            for (const [[a, b], p] of active) {
              const e = ease(clamp(p, 0, 1));
              const [ax, ay] = cellXY(a), [bx, by] = cellXY(b);
              const pa = panels[at[a]], pb = panels[at[b]];
              const A = () => drawPanel(ctx, pa, ax + (bx - ax) * e, ay + (by - ay) * e, 1);
              const B = () => drawPanel(ctx, pb, bx + (ax - bx) * e, by + (ay - by) * e, 1);
              if (under(pa) >= under(pb)) { A(); B(); } else { B(); A(); }
            }
          },
        };
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
      build({ rng, rngA, ground, inks, prm }) {
        const cols = prm.grid, s = W / (cols + 1);
        const rows = Math.max(1, Math.floor(H / s) - 1);
        const ox = (W - cols * s) / 2, oy = (H - rows * s) / 2;
        const maxD = Math.hypot(cols / 2, rows / 2);
        const nests = [];         // each cell's squares, outermost first
        let drawn = 0;
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          if (rng() < prm.omit / 100) continue;
          const t = prm.drift === 'grows' ? (cols > 1 ? c / (cols - 1) : 1)
            : prm.drift === 'centre' ? Math.hypot(c + 0.5 - cols / 2, r + 0.5 - rows / 2) / maxD : 1;
          const dis = prm.disorder / 100 * (prm.drift === 'even' ? 1 : 0.06 + 0.94 * t);
          const col = pickWeighted(inks, rng).hex;
          const cx = ox + (c + 0.5) * s, cy = oy + (r + 0.5) * s;
          const fillK = rng() < prm.fill / 100 ? Math.floor(rng() * prm.nest) : -1;
          // moving: each nest turns slowly, alternate squares the other way
          const spin = (0.05 + rngA() * 0.22) * (rngA() < 0.5 ? -1 : 1);
          const nest = { key: (r * cols + c) / (rows * cols) + (rngA() - 0.5) * 0.5, squares: [] };
          nests.push(nest);
          let key = nest.key;
          for (let k = 0; k < prm.nest; k++) {
            key += 0.015 + rngA() * 0.07;      // each square a little later than the one under it
            const jit = [];
            for (let i = 0; i < 8; i++) jit.push((rng() - 0.5) * 2 * dis * s * 0.16);
            nest.squares.push({
              key, cx, cy, col, fill: k === fillK, jit,
              half: s * 0.42 * (1 - (k / prm.nest) * 0.85),
              rot: (rng() - 0.5) * dis * 0.9 * (1 + k * 0.4),
              spin: spin * (1 + k * 0.45) * (k % 2 ? -1 : 1),
            });
          }
          drawn++;
        }
        // The squares go down in a loose sweep, top to bottom but jumbled within a wide band
        // (Amber: not in a line), and a stack need not be finished before the next one is
        // started — only each square comes after the one under it. The still picture is
        // painted in the same order, so it is the drawing's last frame.
        const squares = nests.flatMap((n) => n.squares).sort((a, b) => a.key - b.key);
        const lw = Math.max(2, s * 0.022);
        const C = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
        function square(ctx, q, t, grow) {
          const a = q.rot + q.spin * t, cs = Math.cos(a) * grow, sn = Math.sin(a) * grow;
          ctx.beginPath();
          C.forEach(([u, v], j) => {
            const lx = u * q.half + q.jit[j * 2], ly = v * q.half + q.jit[j * 2 + 1];
            const x = q.cx + lx * cs - ly * sn, y = q.cy + lx * sn + ly * cs;
            if (j) ctx.lineTo(x, y); else ctx.moveTo(x, y);
          });
          ctx.closePath();
          if (q.fill) { ctx.fillStyle = q.col; ctx.fill(); } else { ctx.strokeStyle = q.col; ctx.stroke(); }
        }
        return {
          total: squares.length,
          // drawing builds each nest a square at a time, slowly enough to see each one land
          drawSeconds: clamp(squares.length * 0.05, 4, 14),
          info: { cols, rows, drawn },
          paint(ctx, t, upto) {
            ctx.fillStyle = ground.hex; ctx.fillRect(0, 0, W, H);
            ctx.lineWidth = lw;
            ctx.lineJoin = 'miter';
            const n = Math.min(squares.length, Math.floor(upto));
            for (let i = 0; i < n; i++) square(ctx, squares[i], t, 1);
            // the one arriving drops onto its stack: a little larger and faint, settling in
            const f = upto - n;
            if (n < squares.length && f > 0) {
              const e = ease(f);
              ctx.globalAlpha = e;
              square(ctx, squares[n], t, 1 + 0.45 * (1 - e));
              ctx.globalAlpha = 1;
            }
          },
        };
      },
    },

    nees: {
      name: 'Gravel',
      after: 'Georg Nees · Frieder Nake',
      params: [
        { k: 'grid', label: 'Columns', min: 6, max: 30, step: 1, def: 16 },
        { k: 'chaos', label: 'Chaos', min: 0, max: 100, step: 1, def: 60 },
        { k: 'grows', label: 'Chaos grows', opts: [['down', 'Downwards'], ['out', 'Outwards']], def: 'down' },
        { k: 'marks', label: 'Marks', opts: [['squares', 'Squares'], ['strokes', 'Strokes']], def: 'squares' },
        { k: 'colour', label: 'Colour', opts: [['one', 'One ink'], ['palette', 'Palette']], def: 'one' },
        { k: 'weight', label: 'Line weight', min: 1, max: 12, step: 0.5, def: 3 },
      ],
      build({ rng, rngA, ground, inks, prm }) {
        // Nees's Schotter: rows of squares that grow more disordered the further down
        // they go; the shifts, turns and line weights are Gaussian.
        const cols = prm.grid, s = W / (cols + 2);
        const rows = Math.max(1, Math.floor(H / s) - 1);
        const ox = (W - cols * s) / 2, oy = (H - rows * s) / 2;
        const one = contrasting(inks, ground).hex;
        const maxD = Math.hypot(cols / 2, rows / 2);
        const marks = [];
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          const f = prm.grows === 'down' ? (rows > 1 ? r / (rows - 1) : 1) : Math.hypot(c + 0.5 - cols / 2, r + 0.5 - rows / 2) / maxD;
          const k = f * prm.chaos / 100;
          marks.push({
            cx: ox + (c + 0.5) * s, cy: oy + (r + 0.5) * s, k,
            rot: gauss(rng) * k * 0.7,
            dx: gauss(rng) * k * s * 0.22, dy: gauss(rng) * k * s * 0.22,
            lw: Math.max(0.8, prm.weight * (1 + gauss(rng) * 0.35 * k)),
            len: 1 + gauss(rng) * 0.25 * k,
            col: prm.colour === 'one' ? one : pickWeighted(inks, rng).hex,
            ph: rngA() * TAU, w: 0.3 + rngA() * 0.6,
          });
        }
        const half = s * 0.47;
        return {
          total: marks.length,
          info: { cols, rows },
          paint(ctx, t, upto) {
            ctx.fillStyle = ground.hex; ctx.fillRect(0, 0, W, H);
            ctx.lineJoin = 'miter';
            ctx.lineCap = 'butt';
            const a = ramp(t, 2), n = Math.min(marks.length, Math.floor(upto));
            for (let i = 0; i < n; i++) {
              const m = marks[i];
              // moving: the gravel stirs, the loose stones most
              const ang = m.rot + a * m.k * 0.35 * Math.sin(t * m.w + m.ph);
              const x = m.cx + m.dx + a * m.k * s * 0.12 * Math.sin(t * m.w * 0.8 + m.ph * 1.3);
              const y = m.cy + m.dy + a * m.k * s * 0.12 * Math.cos(t * m.w * 0.7 + m.ph * 0.7);
              ctx.save();
              ctx.translate(x, y);
              ctx.rotate(ang);
              ctx.strokeStyle = m.col;
              ctx.lineWidth = m.lw;
              ctx.beginPath();
              if (prm.marks === 'squares') ctx.rect(-half, -half, half * 2, half * 2);
              else for (let j = -2; j <= 2; j++) { ctx.moveTo(-half * m.len, j * half * 0.4); ctx.lineTo(half * m.len, j * half * 0.4); }
              ctx.stroke();
              ctx.restore();
            }
          },
        };
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
      build({ rng, rngA, P, prm }) {
        // Multiply needs a light ground, so the lightest colour becomes paper.
        const src = lightest(P);
        const paper = rgbToHex(mix(src.rgb, [255, 255, 255], 0.35));
        let inks = P.filter((c) => c !== src);
        if (!inks.length) inks = [mkColor({ hex: '#1c1b19', w: 1 })];
        const D = Math.hypot(W, H);
        // From π: successive digits of pi, each one not used yet, times 18°, so the
        // grids spread over the half-turn and no two ever lie on top of each other.
        let at = Math.floor(rng() * 90);
        const digits = [];
        while (digits.length < prm.layers) { const d = +PI_DIGITS[at++]; if (!digits.includes(d)) digits.push(d); }
        const base = rng() * 180;
        const layers = [];
        let total = 0;
        for (let i = 0; i < prm.layers; i++) {
          const deg = prm.angles === 'pi' ? digits[i] * 18
            : prm.angles === 'near' ? base + (rng() - 0.5) * 12 : rng() * 180;
          // nearly parallel grids also differ a little in pitch: that is where moiré comes from
          const pitch = prm.angles === 'near' ? prm.spacing * (1 + (rng() - 0.5) * 0.1) : prm.spacing;
          let clip = null;
          if (prm.holes > 0) {
            clip = [];
            for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 8; gx++) if (rng() >= prm.holes / 100) clip.push([gx * W / 8, gy * H / 5]);
            if (!clip.length) clip = null;
          }
          // moving: each grid drifts its own way, up, down, sideways or on the diagonal;
          // only the part of that drift across its lines can be seen
          const dir = Math.floor(rngA() * 8) * TAU / 8, speed = 8 + rngA() * 16;
          const th = deg * Math.PI / 180;
          const lines = Math.ceil((D + pitch) / pitch) + 1;
          total += lines;
          layers.push({
            th, deg, pitch, lines, clip, off: rng() * pitch, col: inks[i % inks.length].hex,
            lw: pitch * prm.weight / 100,
            v: speed * (Math.sin(dir) * Math.cos(th) - Math.cos(dir) * Math.sin(th)),
          });
        }
        return {
          total,
          info: { angles: layers.map((l) => l.deg) },
          paint(ctx, t, upto) {
            ctx.fillStyle = paper; ctx.fillRect(0, 0, W, H);
            ctx.globalCompositeOperation = 'multiply';
            let left = Math.floor(upto);
            for (const L of layers) {
              if (left <= 0) break;
              ctx.save();
              if (L.clip) { ctx.beginPath(); L.clip.forEach(([x, y]) => ctx.rect(x, y, W / 8, H / 5)); ctx.clip(); }
              ctx.translate(W / 2, H / 2);
              ctx.rotate(L.th);
              ctx.fillStyle = L.col;
              const start = -D / 2 - L.pitch + ((((L.off + L.v * t) % L.pitch) + L.pitch) % L.pitch);
              const n = Math.min(L.lines, left);
              for (let k = 0; k < n; k++) ctx.fillRect(-D / 2, start + k * L.pitch, D, L.lw);
              left -= L.lines;
              ctx.restore();
            }
            ctx.globalCompositeOperation = 'source-over';
          },
        };
      },
    },

    vasarely: {
      name: 'Bulging grid',
      after: 'Victor Vasarely',
      params: [
        { k: 'grid', label: 'Columns', min: 8, max: 40, step: 1, def: 20 },
        { k: 'bulge', label: 'Bulge', min: 0, max: 100, step: 1, def: 65 },
        { k: 'shape', label: 'Shapes', opts: [['circle', 'Circles'], ['square', 'Squares'], ['diamond', 'Diamonds'], ['mixed', 'Mixed']], def: 'circle' },
        { k: 'lens', label: 'Bulge sits', opts: [['seed', 'By the seed'], ['light', 'On the light'], ['two', 'In and out']], def: 'seed' },
        { k: 'colour', label: 'Colour', opts: [['checker', 'Checker'], ['gradient', 'Gradient']], def: 'checker' },
      ],
      build({ rng, rngA, ground, inks, prm, lumAt }) {
        // Vasarely's Vega: a chequerboard of "plastic units" pushed out through a lens,
        // so a flat grid swells into a sphere.
        const cols = prm.grid, rows = Math.max(2, Math.round(cols * H / W));
        const cw = W / cols, ch = H / rows;
        const A = ground, B = contrasting(inks, ground);
        const byLight = inks.slice().sort((a, b) => luma(a.rgb) - luma(b.rgb));
        const lenses = [];
        const mk = (x, y, R, sgn) => lenses.push({ x, y, R, sgn, p1: rngA() * TAU, p2: rngA() * TAU, w1: 0.12 + rngA() * 0.12, w2: 0.1 + rngA() * 0.1 });
        if (prm.lens === 'light') {
          let best = -Infinity, bx = 0.5, by = 0.5;
          for (let j = 0; j < 20; j++) for (let i = 0; i < 32; i++) {
            const u = (i + 0.5) / 32, v = (j + 0.5) / 20, l = lumAt(u, v) - 0.15 * Math.hypot(u - 0.5, v - 0.5);
            if (l > best) { best = l; bx = u; by = v; }
          }
          mk(bx * W, by * H, H * 0.55, 1);
        } else if (prm.lens === 'two') {
          mk(W * (0.25 + rng() * 0.15), H * (0.35 + rng() * 0.3), H * (0.38 + rng() * 0.1), 1);
          mk(W * (0.62 + rng() * 0.15), H * (0.35 + rng() * 0.3), H * (0.34 + rng() * 0.1), -1);
        } else {
          mk(W * (0.3 + rng() * 0.4), H * (0.3 + rng() * 0.4), H * (0.4 + rng() * 0.2), 1);
        }
        const kinds = ['circle', 'square', 'diamond'];
        const shapes = Array.from({ length: cols * rows }, () => (prm.shape === 'mixed' ? kinds[Math.floor(rng() * 3)] : prm.shape));
        const V = new Float32Array((cols + 1) * (rows + 1) * 2);
        const bulge = prm.bulge / 100;
        // moving: the lenses wander, and the swelling travels across the grid with them;
        // `swell` takes the bulge from flat (0) to full (1)
        function warp(t, swell) {
          const a = ramp(t, 2);
          const at = lenses.map((L) => ({
            x: L.x + a * W * 0.12 * (Math.sin(t * L.w1 + L.p1) - Math.sin(L.p1)),
            y: L.y + a * H * 0.12 * (Math.sin(t * L.w2 + L.p2) - Math.sin(L.p2)),
            R: L.R, g: 1 - 0.6 * bulge * swell * L.sgn,
          }));
          for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
            let x = i * cw, y = j * ch;
            for (const L of at) {
              const dx = x - L.x, dy = y - L.y, d = Math.hypot(dx, dy);
              if (d > 0 && d < L.R) { const k = L.R * Math.pow(d / L.R, L.g) / d; x = L.x + dx * k; y = L.y + dy * k; }
            }
            const o = (j * (cols + 1) + i) * 2;
            V[o] = x; V[o + 1] = y;
          }
        }
        const colourAt = (i, j) => {
          if (byLight.length < 2) return byLight[0].hex;
          const p = clamp((i / cols + j / rows) / 2, 0, 1) * (byLight.length - 1), k = Math.min(byLight.length - 2, Math.floor(p));
          return rgbToHex(mix(byLight[k].rgb, byLight[k + 1].rgb, p - k));
        };
        // Drawing lays the grid down flat, tile by tile, and then the bulge swells up out of
        // it: the last third of the pieces are the swelling.
        const cells = cols * rows, swelling = Math.round(cells / 2);
        return {
          total: cells + swelling,
          drawSeconds: clamp(2 + cells * 0.012, 4, 8),
          info: { cols, rows, lenses: lenses.length },
          paint(ctx, t, upto) {
            ctx.fillStyle = A.hex; ctx.fillRect(0, 0, W, H);
            warp(t, upto <= cells ? 0 : ease(clamp((upto - cells) / swelling, 0, 1)));
            const n = Math.min(cells, Math.floor(upto));
            ctx.lineJoin = 'round';
            ctx.lineWidth = 1.2;
            for (let k = 0; k < n; k++) {
              const i = k % cols, j = Math.floor(k / cols);
              const q = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].map(([a, b]) => { const o = (b * (cols + 1) + a) * 2; return [V[o], V[o + 1]]; });
              const odd = prm.colour === 'checker' && (i + j) % 2;
              const tile = odd ? B.hex : A.hex;
              const inner = prm.colour === 'checker' ? (odd ? A.hex : B.hex) : colourAt(i, j);
              ctx.fillStyle = tile; ctx.strokeStyle = tile;
              ctx.beginPath(); q.forEach((p, m) => (m ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
              ctx.fill(); ctx.stroke();
              const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
              const area = Math.abs((q[2][0] - q[0][0]) * (q[3][1] - q[1][1]) - (q[3][0] - q[1][0]) * (q[2][1] - q[0][1])) / 2;
              const f = clamp(0.5 * Math.sqrt(area / (cw * ch)), 0.18, 0.88);
              ctx.fillStyle = inner;
              ctx.beginPath();
              const shape = shapes[k];
              if (shape === 'circle') {
                const r = f * 0.5 * Math.min(Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]), Math.hypot(q[3][0] - q[0][0], q[3][1] - q[0][1]));
                ctx.arc(cx, cy, r * 1.1, 0, TAU);
              } else {
                const pts = shape === 'square' ? q : q.map((p, m) => { const r = q[(m + 1) % 4]; return [(p[0] + r[0]) / 2, (p[1] + r[1]) / 2]; });
                const g = shape === 'square' ? f : Math.min(0.95, f * 1.3);
                pts.forEach((p, m) => { const x = cx + (p[0] - cx) * g, y = cy + (p[1] - cy) * g; if (m) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
                ctx.closePath();
              }
              ctx.fill();
            }
          },
        };
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
        { k: 'form', label: 'Form', opts: [['stripes', 'Stripes'], ['dots', 'Dots']], def: 'stripes' },
      ],
      build({ rng, P, inks, prm, lumAt, ground }) {
        const n = prm.stripes, band = H / n, A = prm.amp / 100 * band * 4;
        const om = prm.waves * TAU / W, phi0 = rng() * TAU, drift = prm.drift / 100 * 0.5;
        const speed = (W / prm.waves) / 9;          // moving: a wavelength every nine seconds, right to left
        const xs = [];
        for (let x = -16; x <= W + 16; x += 8) xs.push(x);
        const pad = Math.ceil(A / band) + 2;
        const rowsN = n + 2 * pad + 1;
        // the swell at each point comes from the light map and stays put; the waves move through it
        const amp = [];
        for (let i = -pad; i <= n + pad; i++) amp.push(xs.map((x) => A * (0.15 + 0.85 * lumAt(x / W, clamp(i * band / H, 0, 1)))));
        const cols = [];
        for (let s = 0; s < rowsN - 1; s++) {
          const i = s - pad;
          cols.push(prm.colour === 'sequence' ? P[((i % P.length) + P.length) % P.length] : (i & 1) ? pickWeighted(inks, rng) : null);
        }
        const lines = Array.from({ length: rowsN }, () => new Float32Array(xs.length));
        function curves(t) {
          const sh = speed * t;
          for (let r = 0; r < rowsN; r++) {
            const i = r - pad, y0 = i * band, L = lines[r], prev = r ? lines[r - 1] : null, a = amp[r];
            for (let j = 0; j < xs.length; j++) {
              const y = y0 + a[j] * Math.sin(om * (xs[j] + sh) + phi0 + i * drift);
              L[j] = prev ? Math.max(y, prev[j] + band * 0.15) : y;   // never let stripes cross
            }
          }
        }
        return {
          total: rowsN - 1,
          info: { stripes: rowsN - 1 },
          paint(ctx, t, upto) {
            ctx.fillStyle = ground.hex; ctx.fillRect(0, 0, W, H);
            curves(t);
            const m = Math.min(rowsN - 1, Math.floor(upto));
            if (prm.form === 'dots') {
              // Riley's dot fields: the same waves carry rows of dots that swell and shrink
              const every = Math.max(1, Math.round(band * 1.15 / 8)), sh = speed * t;
              for (let s = 0; s < m; s++) {
                const col = cols[s];
                if (!col) continue;
                ctx.fillStyle = col.hex;
                for (let j = 0; j < xs.length; j += every) {
                  const y0 = lines[s][j], y1 = lines[s + 1][j];
                  const r = (y1 - y0) * 0.5 * (0.3 + 0.7 * (0.5 + 0.5 * Math.sin(om * 1.6 * (xs[j] + sh) + s * 0.7)));
                  ctx.beginPath(); ctx.arc(xs[j], (y0 + y1) / 2, Math.max(0.5, r), 0, TAU); ctx.fill();
                }
              }
              return;
            }
            for (let s = 0; s < m; s++) {
              const col = cols[s];
              if (!col) continue;
              ctx.fillStyle = col.hex;
              ctx.beginPath();
              for (let j = 0; j < xs.length; j++) (j ? ctx.lineTo(xs[j], lines[s][j]) : ctx.moveTo(xs[j], lines[s][j]));
              for (let j = xs.length - 1; j >= 0; j--) ctx.lineTo(xs[j], lines[s + 1][j] + 0.6);
              ctx.closePath();
              ctx.fill();
            }
          },
        };
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
      build({ rng, rngA, noise, ground, inks, prm }) {
        // Amber kept the sweeping look of a field of noisy angles over a smoother, swirling
        // "water" field, knowing its currents gather into a few rivers when it flows.
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
        const lines = [];
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
          lines.push({ pts: new Float32Array(pts), n, width, col });
        }
        // Moving: the strands flow (Amber's calls: no bending in place, no swelling, no
        // fading out and back in; strands may grow out of a point and vanish off the end
        // of their current). Each strand's current is traced once, from where it begins to
        // where it ends: an edge of the picture, or a point inside where it stalls. The
        // drawn strand slides down it, keeping its length, and runs out past the edge or
        // slips into the stall. Behind it, new strands grow one after another out of a
        // spring near where it was drawn and follow it down, so every part of the picture
        // keeps being refilled from where it was full in the still one. (Strands that came
        // in only from the far start of their current left the picture thin for minutes.)
        // A strand on a closed loop round an eddy just circles it. Stopping the trace where
        // it stalls keeps strands from piling up circling a sink. At t=0 every strand is
        // where it was drawn; every frame is a function of t.
        const out = (x, y) => x < -60 || y < -60 || x > W + 60 || y > H + 60;
        const MAXT = 1600, CHECK = 25;
        lines.forEach((L) => { L.v = 6 + rngA() * 6; L.gap = 1.6 + rngA() * 1.6; L.salt = Math.floor(rngA() * 4294967296); L.late = rngA() * 0.35; });   // 24-48px a second; spacing in strand lengths
        // `home`, if given, is the strand's own first point: coming back to it means the
        // current is a closed loop round an eddy
        function trace(x, y, sgn, home) {
          const pts = [];
          for (let k = 0; k < MAXT; k++) {
            const a = field(x, y);
            x += sgn * Math.cos(a) * stepLen; y += sgn * Math.sin(a) * stepLen;
            if (out(x, y)) break;
            if (home && k > 8 && Math.hypot(x - home[0], y - home[1]) < stepLen * 1.5) { pts.loop = true; break; }
            const j = pts.length / 2 - CHECK;            // stalled: barely moved in CHECK steps
            if (j >= 0 && Math.hypot(x - pts[j * 2], y - pts[j * 2 + 1]) < CHECK * stepLen * 0.35) break;
            pts.push(x, y);
          }
          return pts;
        }
        function current(L) {
          const fwd = trace(L.pts[L.n * 2 - 2], L.pts[L.n * 2 - 1], 1, [L.pts[0], L.pts[1]]);
          if (fwd.loop) {
            // round an eddy: the strand circles it for ever, alone
            L.loop = true; L.home = 0; L.len = L.n + fwd.length / 2;
            L.path = new Float32Array(L.len * 2);
            L.path.set(L.pts); L.path.set(fwd, L.n * 2);
            return;
          }
          const back = trace(L.pts[0], L.pts[1], -1);
          L.home = back.length / 2;
          L.len = L.home + L.n + fwd.length / 2;
          L.path = new Float32Array(L.len * 2);
          for (let i = 0; i < L.home; i++) { L.path[i * 2] = back[(L.home - 1 - i) * 2]; L.path[i * 2 + 1] = back[(L.home - 1 - i) * 2 + 1]; }
          L.path.set(L.pts, L.home * 2);
          L.path.set(fwd, (L.home + L.n) * 2);
        }
        const buf = new Float32Array(prm.length * 2 + 2);
        // Watch it draw flows the picture in: every strand grows out of a point a strand's
        // length up its own current and slides down into its place, all together, a
        // little staggered, ending on the still picture.
        function flowIn(ctx, p) {
          for (const L of lines) {
            const e = ease(clamp((p - L.late) / (1 - 0.35), 0, 1));
            if (e <= 0) continue;
            if (!L.path) current(L);
            const from = L.home - L.n, w = from - L.n + e * L.n * 2;   // head enters at `from`, tail ends at home
            let c = 0;
            for (let j = 0; j < L.n; j++) {
              const f = w + j;
              if (f < Math.max(0, from)) continue;
              const a = Math.floor(f), b = Math.min(L.len - 1, a + 1), u = f - a;
              buf[c * 2] = L.path[a * 2] + (L.path[b * 2] - L.path[a * 2]) * u;
              buf[c * 2 + 1] = L.path[a * 2 + 1] + (L.path[b * 2 + 1] - L.path[a * 2 + 1]) * u;
              c++;
            }
            if (c >= L.n) ribbon(ctx, buf, c, L.width, L.col);
            else if (c > 1) ribbon(ctx, buf, c, L.width * Math.pow(c / L.n, 0.8), L.col, 0, c);
          }
        }
        return {
          total: lines.length,
          drawSeconds: 6,
          info: { kept: lines.length },
          paint(ctx, t, upto) {
            ctx.fillStyle = ground.hex; ctx.fillRect(0, 0, W, H);
            if (upto < lines.length) { flowIn(ctx, upto / lines.length); return; }
            const n = lines.length;
            const travel = t - (1 - Math.exp(-t));       // eases from rest up to full speed
            for (let i = 0; i < n; i++) {
              const L = lines[i];
              if (t <= 0) { ribbon(ctx, L.pts, L.n, L.width, L.col); continue; }
              if (!L.path) current(L);
              // strand q of this current covers [w, w + n): strand 0 starts where it was
              // drawn, strand 1 just before the current begins, the rest a spacing apart
              const go = L.v * travel;
              if (L.loop) {
                let c = 0;
                for (let j = 0; j < L.n; j++) {
                  const f = (go + j) % L.len, p = Math.floor(f), q = (p + 1) % L.len, u = f - p;
                  buf[c * 2] = L.path[p * 2] + (L.path[q * 2] - L.path[p * 2]) * u;
                  buf[c * 2 + 1] = L.path[p * 2 + 1] + (L.path[q * 2 + 1] - L.path[p * 2 + 1]) * u;
                  c++;
                }
                ribbon(ctx, buf, c, L.width, L.col);
                continue;
              }
              // Strand 0 is the drawn one, carried off downstream. Strand q (q >= 1) grows
              // out of the spring — a point near where strand 0 was drawn, a little
              // different each time — once the one before has moved a spacing on, then
              // follows it down the current and off the end.
              const S = L.n * L.gap, qLast = Math.floor((go + L.n) / S);
              for (let qn = 0; qn <= qLast; qn++) {
                let w = L.home + go, from = 0;
                if (qn > 0) {
                  const r = mulberry32((L.salt + Math.imul(qn, 0x9e3779b1)) >>> 0);
                  from = clamp(Math.round(L.home + (r() - 0.5) * L.n * 0.6), 0, L.len - 1);
                  w = from + go - qn * S;
                }
                if (w >= L.len - 1 || w + L.n <= from) continue;
                let c = 0, k0 = -1;
                for (let j = 0; j < L.n; j++) {
                  const f = w + j;
                  if (f < from) continue;
                  if (f > L.len - 1) break;
                  if (k0 < 0) k0 = j;
                  const p = Math.floor(f), q = Math.min(L.len - 1, p + 1), u = f - p;
                  buf[c * 2] = L.path[p * 2] + (L.path[q * 2] - L.path[p * 2]) * u;
                  buf[c * 2 + 1] = L.path[p * 2 + 1] + (L.path[q * 2 + 1] - L.path[p * 2 + 1]) * u;
                  c++;
                }
                if (c < 2) continue;
                // one still growing out of its spring starts as a hairline and fills out
                // as it lengthens, tapered over what has come out so far
                if (qn > 0 && k0 > 0) ribbon(ctx, buf, c, L.width * Math.pow(c / L.n, 0.8), L.col, 0, c);
                else ribbon(ctx, buf, c, L.width, L.col, k0, L.n);
              }
            }
          },
        };
      },
    },

    zebra: {
      name: 'Zebra',
      after: 'Victor Vasarely',
      params: [
        { k: 'stripes', label: 'Stripes', min: 10, max: 90, step: 1, def: 36 },
        { k: 'twist', label: 'Twist', min: 0, max: 100, step: 1, def: 60 },
        { k: 'bulge', label: 'Bulge', min: 0, max: 100, step: 1, def: 35 },
        { k: 'centres', label: 'Twists', min: 1, max: 4, step: 1, def: 2 },
        { k: 'colour', label: 'Colour', opts: [['bw', 'Two tone'], ['palette', 'Palette']], def: 'bw' },
      ],
      build({ rng, rngA, P, ground, inks, prm }) {
        // Vasarely's Zebra period: parallel stripes on a sheet that is twisted and swollen
        // in places, so they wrap round like fur over a body. A twist by an angle that
        // depends only on the distance from its centre can never fold the sheet, so the
        // stripes never cross. Moving, the twists writhe.
        const D = Math.hypot(W, H), period = H * 1.25 / prm.stripes;
        const dir = rng() * Math.PI, ux = Math.cos(dir), uy = Math.sin(dir);    // along the stripes
        const twists = [];
        for (let i = 0; i < prm.centres; i++) {
          twists.push({ x: W * (0.15 + rng() * 0.7), y: H * (0.15 + rng() * 0.7), R: H * (0.4 + rng() * 0.45), s: rng() < 0.5 ? -1 : 1, ph: rngA() * TAU, w: 0.12 + rngA() * 0.15 });
        }
        const dark = prm.colour === 'bw' ? darkest(P) : null, back = prm.colour === 'bw' ? lightest(P) : ground;
        const n = Math.ceil(D * 1.3 / period);
        const cols = [];
        for (let k = 0; k < n; k++) cols.push(k % 2 ? (dark || pickWeighted(inks, rng)) : null);
        const us = [];
        for (let u = -0.65 * D; u <= 0.65 * D; u += 10) us.push(u);
        const V = Array.from({ length: n + 1 }, () => new Float32Array(us.length * 2));
        const twist = prm.twist / 100 * Math.PI * 1.6, g = 1 - 0.55 * prm.bulge / 100;
        function sheet(t) {
          const a = ramp(t, 3);
          const tw = twists.map((c) => ({ x: c.x, y: c.y, R: c.R, k: twist * c.s * (1 + 0.4 * a * (Math.sin(t * c.w + c.ph) - Math.sin(c.ph))) }));
          for (let k = 0; k <= n; k++) {
            const v = -0.65 * D + k * period, row = V[k];
            for (let j = 0; j < us.length; j++) {
              let x = W / 2 + us[j] * ux - v * uy, y = H / 2 + us[j] * uy + v * ux;
              for (const c of tw) {
                const dx = x - c.x, dy = y - c.y, r = Math.hypot(dx, dy);
                if (r <= 0 || r >= c.R) continue;
                const f = 1 - r / c.R, phi = c.k * f * f, cs = Math.cos(phi), sn = Math.sin(phi);
                const sc = c.R * Math.pow(r / c.R, g) / r;
                x = c.x + (dx * cs - dy * sn) * sc; y = c.y + (dx * sn + dy * cs) * sc;
              }
              row[j * 2] = x; row[j * 2 + 1] = y;
            }
          }
        }
        return {
          total: n,
          info: { stripes: n },
          paint(ctx, t, upto) {
            ctx.fillStyle = back.hex; ctx.fillRect(0, 0, W, H);
            sheet(t);
            const m = Math.min(n, Math.floor(upto));
            for (let k = 0; k < m; k++) {
              if (!cols[k]) continue;
              const A = V[k], B = V[k + 1];
              ctx.fillStyle = cols[k].hex;
              ctx.beginPath();
              for (let j = 0; j < us.length; j++) (j ? ctx.lineTo(A[j * 2], A[j * 2 + 1]) : ctx.moveTo(A[0], A[1]));
              for (let j = us.length - 1; j >= 0; j--) ctx.lineTo(B[j * 2], B[j * 2 + 1]);
              ctx.closePath();
              ctx.fill();
            }
          },
        };
      },
    },

    escher: {
      name: 'Tessellation',
      after: 'M. C. Escher',
      params: [
        { k: 'tiles', label: 'Tiles across', min: 3, max: 14, step: 1, def: 6 },
        { k: 'shape', label: 'Lattice', opts: [['square', 'Square'], ['hex', 'Hexagonal']], def: 'square' },
        { k: 'wiggle', label: 'Wiggle', min: 0, max: 100, step: 1, def: 60 },
        { k: 'colours', label: 'Colours', opts: [['two', 'Two'], ['three', 'Three']], def: 'three' },
        { k: 'detail', label: 'Detail', opts: [['eye', 'Eye and line'], ['none', 'Plain']], def: 'eye' },
      ],
      build({ rng, rngA, P, ground, inks, prm }) {
        // Escher's interlocking tiles: start from squares or hexagons, bend one edge of each
        // opposite pair any way at all, and give its partner the very same bend. Every tile
        // is then the same shape and they fit with no gaps. The bends are seeded sums of
        // sine waves, which keep the corners where they are. Moving, the bends morph and
        // the tiles stay locked together throughout.
        const hex = prm.shape === 'hex', s = W / prm.tiles, amp = prm.wiggle / 100 * 0.26, N = 24;
        // each bend has a second shape, from the movement's stream, that it morphs towards
        // and back, so moving tiles stay creature-like rather than relaxing to plain squares
        const bend = () => Array.from({ length: 4 }, (_, k) => ({
          a: (rng() - 0.5) * 2 * amp / Math.pow(k + 1, 0.8), b: (rngA() - 0.5) * 2 * amp / Math.pow(k + 1, 0.8), w: 0.18 + rngA() * 0.22,
        }));
        let V;
        if (hex) { const R = s / Math.sqrt(3); V = Array.from({ length: 6 }, (_, k) => [R * Math.cos(Math.PI / 3 * k + Math.PI / 6), R * Math.sin(Math.PI / 3 * k + Math.PI / 6)]); }
        else V = [[0, 0], [s, 0], [s, s], [0, s]];
        const bends = hex ? [bend(), bend(), bend()] : [bend(), bend()];
        const edge = (p, q, b, t) => {
          const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy), out = [];
          for (let i = 0; i <= N; i++) {
            const u = i / N;
            let d = 0;
            b.forEach((c, k) => { d += (c.a + (c.b - c.a) * (0.5 - 0.5 * Math.cos(t * c.w))) * Math.sin((k + 1) * Math.PI * u); });
            out.push([p[0] + dx * u - dy / L * d * L, p[1] + dy * u + dx / L * d * L]);
          }
          return out;
        };
        const shift = (pts, T) => pts.map((p) => [p[0] + T[0], p[1] + T[1]]);
        function outline(t) {
          if (!hex) {
            const eh = edge(V[0], V[1], bends[0], t), ev = edge(V[0], V[3], bends[1], t);
            return eh.concat(shift(ev, [s, 0]), shift(eh, [0, s]).reverse(), ev.slice().reverse());
          }
          const e = [0, 1, 2].map((k) => edge(V[k], V[k + 1], bends[k], t));
          const T = [[V[4][0] - V[0][0], V[4][1] - V[0][1]], [V[5][0] - V[1][0], V[5][1] - V[1][1]], [V[0][0] - V[2][0], V[0][1] - V[2][1]]];
          return e[0].concat(e[1], e[2], shift(e[0], T[0]).reverse(), shift(e[1], T[1]).reverse(), shift(e[2], T[2]).reverse());
        }
        // the colours: a three-colouring where no two neighbours match (two is a chequer,
        // on squares only — hexagons always need three)
        const others = inks.slice().sort((a, b) => b.w - a.w);
        const c1 = contrasting(inks, ground), c2 = others.find((c) => c !== c1) || mkColor({ hex: rgbToHex(mix(c1.rgb, ground.rgb, 0.5)), w: 0 });
        const three = hex || prm.colours === 'three';
        const fills = three ? [ground, c1, c2] : [ground, c1];
        const line = darkest(P), mark = lightest(P);
        const tiles = [];
        const D = Math.hypot(W, H), M = Math.ceil(D / s) + 2, off = [rng() * s, rng() * s];
        for (let j = -M; j <= M; j++) for (let i = -M; i <= M; i++) {
          let x, y;
          if (hex) { x = W / 2 + i * (V[0][0] + V[1][0]) + j * (V[1][0] + V[2][0]); y = H / 2 + i * (V[0][1] + V[1][1]) + j * (V[1][1] + V[2][1]); }
          else { x = i * s - off[0]; y = j * s - off[1]; }
          if (x < -s * 1.5 || y < -s * 1.5 || x > W + s * 0.5 || y > H + s * 0.5) continue;
          const ci = three ? (((hex ? i - j : i + 2 * j) % 3) + 3) % 3 : ((i + j) % 2 + 2) % 2;
          tiles.push({ x, y, col: fills[ci], key: Math.hypot(x - W / 2, y - H / 2) + rng() * s * 1.5 });
        }
        tiles.sort((a, b) => a.key - b.key);        // laid from the middle outwards
        // the eye sits at the same place in every tile, so they read as creatures
        const base = outline(0), cen = base.reduce((m, p) => [m[0] + p[0] / base.length, m[1] + p[1] / base.length], [0, 0]);
        const eye = [cen[0] + (rng() - 0.5) * s * 0.35, cen[1] + (rng() - 0.5) * s * 0.35];
        return {
          total: tiles.length,
          info: { tiles: tiles.length },
          paint(ctx, t, upto) {
            ctx.fillStyle = ground.hex; ctx.fillRect(0, 0, W, H);
            const poly = outline(t);
            const n = Math.min(tiles.length, Math.floor(upto));
            ctx.lineJoin = 'round';
            for (let k = 0; k < n; k++) {
              const T = tiles[k];
              ctx.save();
              ctx.translate(T.x, T.y);
              ctx.beginPath();
              poly.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
              ctx.closePath();
              ctx.fillStyle = T.col.hex; ctx.fill();
              ctx.strokeStyle = line.hex; ctx.lineWidth = Math.max(1.5, s * 0.012); ctx.stroke();
              if (prm.detail === 'eye') {
                const ink = T.col === line ? mark.hex : line.hex;
                ctx.beginPath();
                poly.forEach((p, i) => { const x = cen[0] + (p[0] - cen[0]) * 0.72, y = cen[1] + (p[1] - cen[1]) * 0.72; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
                ctx.closePath();
                ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1.2, s * 0.01); ctx.stroke();
                ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(eye[0], eye[1], s * 0.05, 0, TAU); ctx.fill();
                ctx.fillStyle = T.col.hex; ctx.beginPath(); ctx.arc(eye[0] + s * 0.012, eye[1], s * 0.022, 0, TAU); ctx.fill();
              }
              ctx.restore();
            }
          },
        };
      },
    },

    coxeter: {
      name: 'Kaleidoscope',
      after: 'H. S. M. Coxeter',
      params: [
        { k: 'group', label: 'Mirrors', opts: [['333', 'Triangles'], ['244', 'Squares'], ['236', 'Hexagons'], ['polar', 'Round']], def: '236' },
        { k: 'size', label: 'Size', min: 100, max: 600, step: 10, def: 280 },
        { k: 'motifs', label: 'Pieces', min: 2, max: 16, step: 1, def: 8 },
        { k: 'fold', label: 'Round folds', min: 3, max: 16, step: 1, def: 8 },
        { k: 'mirrors', label: 'Mirror lines', opts: [['hide', 'Hidden'], ['show', 'Shown']], def: 'hide' },
      ],
      build({ rng, rngA, ground, inks, prm }) {
        // Coxeter's reflection groups: a few pieces in one triangle of mirrors, and that
        // triangle reflected across its own sides again and again until it fills the
        // plane. Only three triangles tile the flat plane by reflection — 60-60-60,
        // 90-45-45 and 90-60-30 — plus the round kaleidoscope's wedge. Moving, the pieces
        // drift about inside the mirrors, the way turning a kaleidoscope does.
        const polar = prm.group === 'polar', L = prm.size;
        const Rm = Math.hypot(W, H) * 0.56;
        const T = polar ? [[0, 0], [Rm, 0], [Rm * Math.cos(Math.PI / prm.fold), Rm * Math.sin(Math.PI / prm.fold)]]
          : prm.group === '333' ? [[0, 0], [L, 0], [L / 2, L * Math.sqrt(3) / 2]]
          : prm.group === '244' ? [[0, 0], [L, 0], [0, L]]
          : [[0, 0], [L * 0.7, 0], [0, L * 0.7 * Math.sqrt(3)]];
        const cen = [(T[0][0] + T[1][0] + T[2][0]) / 3, (T[0][1] + T[1][1] + T[2][1]) / 3];
        const mul = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
        const at = (M, p) => [M[0] * p[0] + M[2] * p[1] + M[4], M[1] * p[0] + M[3] * p[1] + M[5]];
        const mirror = (p, q) => {
          const l = Math.hypot(q[0] - p[0], q[1] - p[1]), dx = (q[0] - p[0]) / l, dy = (q[1] - p[1]) / l;
          const R = [2 * dx * dx - 1, 2 * dx * dy, 2 * dx * dy, 2 * dy * dy - 1, 0, 0], rp = at(R, p);
          R[4] = p[0] - rp[0]; R[5] = p[1] - rp[1];
          return R;
        };
        const tris = [];
        if (polar) {
          const base = [1, 0, 0, 1, W / 2, H / 2];
          for (let k = 0; k < prm.fold; k++) {
            const a = TAU * k / prm.fold, rot = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
            tris.push(mul(base, rot), mul(base, mul(rot, [1, 0, 0, -1, 0, 0])));
          }
        } else {
          const base = [1, 0, 0, 1, W / 2 - cen[0], H / 2 - cen[1]];
          const seen = new Set(), queue = [base], key = (M) => { const c = at(M, cen); return Math.round(c[0] / 4) + ',' + Math.round(c[1] / 4); };
          seen.add(key(base));
          while (queue.length && tris.length < 4000) {
            const M = queue.shift();
            tris.push(M);
            for (let e = 0; e < 3; e++) {
              const N = mul(mirror(at(M, T[e]), at(M, T[(e + 1) % 3])), M), c = at(N, cen), k = key(N);
              if (seen.has(k) || c[0] < -L * 1.2 || c[1] < -L * 1.2 || c[0] > W + L * 1.2 || c[1] > H + L * 1.2) continue;
              seen.add(k);
              queue.push(N);
            }
          }
        }
        // the pieces, in the first triangle
        const unit = polar ? Rm * 0.12 : L * 0.5;
        const pieces = [];
        for (let i = 0; i < prm.motifs; i++) {
          let r1 = rng(), r2 = rng(), p;
          if (polar) {
            // spread by distance from the middle, not by area, which would put nearly
            // everything out at the rim of the wedge
            const rr = Rm * (0.04 + 0.62 * r1), th = r2 * Math.PI / prm.fold;
            p = [rr * Math.cos(th), rr * Math.sin(th)];
          } else {
            if (r1 + r2 > 1) { r1 = 1 - r1; r2 = 1 - r2; }
            p = [T[0][0] + r1 * (T[1][0] - T[0][0]) + r2 * (T[2][0] - T[0][0]), T[0][1] + r1 * (T[1][1] - T[0][1]) + r2 * (T[2][1] - T[0][1])];
          }
          pieces.push({
            p, kind: Math.floor(rng() * 4), col: pickWeighted(inks, rng).hex,
            r: unit * (0.12 + rng() * 0.35), a: rng() * TAU, lw: unit * (0.03 + rng() * 0.06),
            w: 0.15 + rngA() * 0.3, ph: rngA() * TAU, amp: unit * (0.15 + rngA() * 0.3),
          });
        }
        const lineCol = contrasting(inks, ground).hex;
        // Watch it draw starts from nothing: the pieces come in one at a time, each growing
        // from a point to its full size, in every mirror at once.
        return {
          total: pieces.length,
          drawSeconds: clamp(1 + pieces.length * 0.5, 3, 8),
          info: { triangles: tris.length },
          paint(ctx, t, upto) {
            ctx.fillStyle = ground.hex; ctx.fillRect(0, 0, W, H);
            const a = ramp(t, 2), n = tris.length;
            const grow = pieces.map((q, i) => (upto >= pieces.length ? 1 : ease(clamp(upto - i, 0, 1))));
            const placed = pieces.map((q) => [q.p[0] + a * q.amp * (Math.sin(t * q.w + q.ph) - Math.sin(q.ph)), q.p[1] + a * q.amp * (Math.cos(t * q.w * 0.8 + q.ph) - Math.cos(q.ph)), q.a + a * 0.4 * Math.sin(t * q.w * 0.6)]);
            for (let k = 0; k < n; k++) {
              const M = tris[k];
              ctx.save();
              ctx.setTransform(M[0], M[1], M[2], M[3], M[4], M[5]);
              ctx.beginPath(); ctx.moveTo(T[0][0], T[0][1]); ctx.lineTo(T[1][0], T[1][1]); ctx.lineTo(T[2][0], T[2][1]); ctx.closePath();
              ctx.save();
              ctx.clip();
              pieces.forEach((q, i) => {
                const g = grow[i];
                if (g <= 0) return;
                const [x, y, ang] = placed[i], r = q.r * g;
                ctx.fillStyle = q.col; ctx.strokeStyle = q.col; ctx.lineWidth = q.lw * g;
                ctx.beginPath();
                if (q.kind === 0) { ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
                else if (q.kind === 1) { ctx.arc(x, y, r, 0, TAU); ctx.stroke(); }
                else if (q.kind === 2) { ctx.moveTo(x - Math.cos(ang) * r * 1.6, y - Math.sin(ang) * r * 1.6); ctx.lineTo(x + Math.cos(ang) * r * 1.6, y + Math.sin(ang) * r * 1.6); ctx.stroke(); }
                else { for (let v = 0; v < 3; v++) { const b = ang + v * TAU / 3; if (v) ctx.lineTo(x + Math.cos(b) * r, y + Math.sin(b) * r); else ctx.moveTo(x + Math.cos(b) * r, y + Math.sin(b) * r); } ctx.closePath(); ctx.fill(); }
              });
              ctx.restore();
              if (prm.mirrors === 'show') { ctx.globalAlpha = 0.35; ctx.strokeStyle = lineCol; ctx.lineWidth = 2; ctx.stroke(); ctx.globalAlpha = 1; }
              ctx.restore();
            }
          },
        };
      },
    },

    mohr: {
      name: 'Hypercube',
      after: 'Manfred Mohr',
      params: [
        { k: 'grid', label: 'Columns', min: 1, max: 8, step: 1, def: 4 },
        { k: 'keep', label: 'Edges kept', min: 10, max: 100, step: 1, def: 70, unit: '%' },
        { k: 'fills', label: 'Filled faces', min: 0, max: 8, step: 1, def: 2 },
        { k: 'weight', label: 'Line weight', min: 1, max: 12, step: 0.5, def: 4 },
        { k: 'depth', label: 'Perspective', min: 0, max: 100, step: 1, def: 50 },
      ],
      build({ rng, rngA, ground, inks, prm }) {
        // Mohr's hypercubes: the sixteen corners of a four-dimensional cube, turned in four
        // dimensions, seen in perspective, and drawn with only some of its 32 edges — each
        // cell its own turn and its own selection, so the grid reads as one structure
        // taken apart. Drawing goes edge by edge like his plotter; moving, every cube
        // keeps turning in 4D.
        const VERTS = [], EDGES = [], FACES = [];
        for (let i = 0; i < 16; i++) VERTS.push([0, 1, 2, 3].map((b) => ((i >> b) & 1 ? 1 : -1)));
        for (let i = 0; i < 16; i++) for (let b = 0; b < 4; b++) { const j = i ^ (1 << b); if (j > i) EDGES.push([i, j]); }
        for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) for (let r = 0; r < 16; r++) {
          if (r & (1 << a) || r & (1 << b)) continue;
          FACES.push([r, r | (1 << a), r | (1 << a) | (1 << b), r | (1 << b)]);
        }
        const PLANES = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
        const cols = prm.grid, rows = Math.max(1, Math.round(cols * H / W));
        const cell = Math.min(W / (cols + 0.3), H / (rows + 0.2));
        const ox = (W - cols * cell) / 2, oy = (H - rows * cell) / 2;
        const persp = prm.depth / 100, size = cell * 0.3 / (1 + persp * 0.5);
        const ink = contrasting(inks, ground).hex;
        const cells = [];
        let total = 0;
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          const keep = clamp(Math.round(32 * prm.keep / 100 * (0.7 + 0.6 * rng())), 3, 32);
          const edges = shuffle(EDGES.slice(), rng).slice(0, keep);
          const faces = shuffle(FACES.slice(), rng).slice(0, prm.fills).map((f) => ({ f, col: pickWeighted(inks, rng).hex }));
          cells.push({
            cx: ox + (c + 0.5) * cell, cy: oy + (r + 0.5) * cell, edges, faces,
            ang: PLANES.map(() => rng() * TAU), spin: PLANES.map(() => (rngA() - 0.5) * 0.35),
          });
          total += faces.length + edges.length;
        }
        const pts = new Float32Array(32);
        function project(C, t) {
          for (let i = 0; i < 16; i++) {
            const p = VERTS[i].slice();
            PLANES.forEach(([a, b], k) => {
              const g = C.ang[k] + C.spin[k] * t, cs = Math.cos(g), sn = Math.sin(g), x = p[a], y = p[b];
              p[a] = x * cs - y * sn; p[b] = x * sn + y * cs;
            });
            const k4 = 1 / (1 - 0.28 * persp * p[3] / 2), z = p[2] * k4, k3 = 1 / (1 - 0.2 * persp * z / 2);
            pts[i * 2] = C.cx + p[0] * k4 * k3 * size; pts[i * 2 + 1] = C.cy + p[1] * k4 * k3 * size;
          }
        }
        return {
          total,
          info: { cells: cells.length },
          paint(ctx, t, upto) {
            ctx.fillStyle = ground.hex; ctx.fillRect(0, 0, W, H);
            ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            let left = upto;
            for (const C of cells) {
              if (left <= 0) break;
              project(C, t);
              for (const F of C.faces) {
                if (left <= 0) break;
                left -= 1;
                ctx.fillStyle = F.col;
                ctx.beginPath();
                F.f.forEach((v, i) => (i ? ctx.lineTo(pts[v * 2], pts[v * 2 + 1]) : ctx.moveTo(pts[v * 2], pts[v * 2 + 1])));
                ctx.closePath();
                ctx.fill();
              }
              ctx.strokeStyle = ink; ctx.lineWidth = prm.weight;
              for (const [a, b] of C.edges) {
                if (left <= 0) break;
                const f = Math.min(1, left);       // the pen part way along an edge
                left -= 1;
                ctx.beginPath();
                ctx.moveTo(pts[a * 2], pts[a * 2 + 1]);
                ctx.lineTo(pts[a * 2] + (pts[b * 2] - pts[a * 2]) * f, pts[a * 2 + 1] + (pts[b * 2 + 1] - pts[a * 2 + 1]) * f);
                ctx.stroke();
              }
            }
          },
        };
      },
    },

    reas: {
      name: 'Process',
      after: 'Casey Reas',
      params: [
        { k: 'agents', label: 'Elements', min: 20, max: 300, step: 5, def: 120 },
        { k: 'size', label: 'Reach', min: 20, max: 200, step: 5, def: 80 },
        { k: 'steps', label: 'Steps', min: 100, max: 1500, step: 50, def: 500 },
        { k: 'speed', label: 'Speed', min: 1, max: 8, step: 0.5, def: 3 },
        { k: 'wander', label: 'Wander', min: 0, max: 100, step: 1, def: 35 },
        { k: 'alpha', label: 'Trace', min: 2, max: 30, step: 1, def: 7, unit: '%' },
      ],
      build({ rng, noise, ground, inks, prm }) {
        // Reas's Process: circles drift across the surface; wherever two overlap, a faint
        // line joins their centres. Nothing is drawn but those lines, and the picture
        // is what they leave behind.
        if (!reasCanvas) reasCanvas = makeCanvas(W, H);
        const oc = reasCanvas.getContext('2d');
        const start = [];
        for (let i = 0; i < prm.agents; i++) {
          const col = pickWeighted(inks, rng);
          start.push({ x: rng() * W, y: rng() * H, h: rng() * TAU, r: prm.size * (0.5 + rng()), ci: inks.indexOf(col) });
        }
        const total = prm.steps;
        let agents, steps, lines;
        const reset = () => {
          agents = start.map((a) => Object.assign({}, a));
          steps = 0; lines = 0;
          oc.globalAlpha = 1; oc.globalCompositeOperation = 'source-over';
          oc.fillStyle = ground.hex; oc.fillRect(0, 0, W, H);
        };
        const step = () => {
          const wander = prm.wander / 100 * 0.12;
          for (const a of agents) {
            a.h += noise(a.x / 700, a.y / 700 + steps * 0.004) * wander;
            a.x += Math.cos(a.h) * prm.speed; a.y += Math.sin(a.h) * prm.speed;
            if (a.x < 0) { a.x = -a.x; a.h = Math.PI - a.h; } else if (a.x > W) { a.x = 2 * W - a.x; a.h = Math.PI - a.h; }
            if (a.y < 0) { a.y = -a.y; a.h = -a.h; } else if (a.y > H) { a.y = 2 * H - a.y; a.h = -a.h; }
          }
          const paths = inks.map(() => makePath());
          for (let i = 0; i < agents.length; i++) {
            const a = agents[i];
            for (let j = i + 1; j < agents.length; j++) {
              const b = agents[j], dx = a.x - b.x, dy = a.y - b.y, rr = a.r + b.r;
              if (dx * dx + dy * dy < rr * rr) { paths[a.ci].moveTo(a.x, a.y); paths[a.ci].lineTo(b.x, b.y); lines++; }
            }
          }
          oc.globalAlpha = prm.alpha / 100;
          oc.lineWidth = 1.6;
          paths.forEach((p, k) => { oc.strokeStyle = inks[k].hex; oc.stroke(p); });
          // Past the still picture the oldest traces slowly fade, so it can run for ever:
          // 8% once a second (40 steps). Spread thinner, a fade below about 1/255 a step
          // rounds away to nothing and the traces pile up into grey.
          if (steps >= total && (steps - total) % 40 === 39) { oc.globalAlpha = 0.08; oc.fillStyle = ground.hex; oc.fillRect(0, 0, W, H); }
          oc.globalAlpha = 1;
          steps++;
        };
        reset();
        const scene = {
          total,
          info: {},
          paint(ctx, t, upto) {
            const target = upto < total ? Math.floor(upto) : total + Math.floor(t * 40);
            if (target < steps) reset();
            while (steps < target) step();
            scene.info.lines = lines;
            ctx.drawImage(reasCanvas, 0, 0);
          },
        };
        return scene;
      },
    },

    knowlton: {
      name: 'Mosaic',
      after: 'Ken Knowlton',
      params: [
        { k: 'cells', label: 'Across', min: 30, max: 140, step: 1, def: 80 },
        { k: 'glyphs', label: 'Made of', opts: [['symbols', 'Symbols'], ['letters', 'Letters']], def: 'symbols' },
        { k: 'colour', label: 'Colour', opts: [['ink', 'One ink'], ['tone', 'By tone']], def: 'ink' },
        { k: 'contrast', label: 'Contrast', min: 50, max: 250, step: 5, def: 120, unit: '%' },
      ],
      build({ rngA, P, prm, toneAt }) {
        // Knowlton's computer pointillism: the photo rebuilt from small symbols, each
        // one chosen for how much ink it puts down. Best with a photo; without one the
        // seed's light map stands in.
        const cols = prm.cells, rows = Math.max(2, Math.round(cols * H / W));
        const cw = W / cols, ch = H / rows;
        const paperSrc = lightest(P);
        const paper = rgbToHex(mix(paperSrc.rgb, [255, 255, 255], 0.3));
        const darks = P.filter((c) => c !== paperSrc).sort((a, b) => luma(a.rgb) - luma(b.rgb));
        if (!darks.length) darks.push(mkColor({ hex: '#1c1b19', w: 1 }));
        const ink = darks[0].hex;
        const tone = new Float32Array(cols * rows);
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
          tone[j * cols + i] = clamp(0.5 + (toneAt((i + 0.5) / cols, (j + 0.5) / rows) - 0.5) * prm.contrast / 100, 0, 1);
        }
        // moving: slow ripples spread from a point and the symbols change as they pass
        const rx = W * (0.2 + rngA() * 0.6), ry = H * (0.2 + rngA() * 0.6);
        const LETTERS = ' .:-=+*#%@';
        const r = Math.min(cw, ch) / 2;
        const glyph = (ctx, lv, x, y) => {
          switch (lv) {
            case 1: ctx.beginPath(); ctx.arc(x, y, r * 0.16, 0, TAU); ctx.fill(); break;
            case 2: ctx.fillRect(x - r * 0.45, y - r * 0.08, r * 0.9, r * 0.16); break;
            case 3: ctx.fillRect(x - r * 0.4, y - r * 0.08, r * 0.8, r * 0.16); ctx.fillRect(x - r * 0.08, y - r * 0.4, r * 0.16, r * 0.8); break;
            case 4: ctx.lineWidth = r * 0.16; ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, TAU); ctx.stroke(); break;
            case 5: ctx.lineWidth = r * 0.24; ctx.beginPath(); ctx.moveTo(x - r * 0.6, y - r * 0.6); ctx.lineTo(x + r * 0.6, y + r * 0.6); ctx.moveTo(x + r * 0.6, y - r * 0.6); ctx.lineTo(x - r * 0.6, y + r * 0.6); ctx.stroke(); break;
            case 6: ctx.fillRect(x - r * 0.85, y - r * 0.17, r * 1.7, r * 0.34); ctx.fillRect(x - r * 0.17, y - r * 0.85, r * 0.34, r * 1.7); break;
            case 7: ctx.lineWidth = r * 0.3; ctx.strokeRect(x - r * 0.6, y - r * 0.6, r * 1.2, r * 1.2); break;
            case 8: ctx.beginPath(); ctx.arc(x, y, r * 0.78, 0, TAU); ctx.fill(); break;
            case 9: ctx.fillRect(x - r * 0.9, y - r * 0.9, r * 1.8, r * 1.8); break;
            default: break;
          }
        };
        return {
          total: cols * rows,
          info: { cols, rows },
          paint(ctx, t, upto) {
            ctx.fillStyle = paper; ctx.fillRect(0, 0, W, H);
            const a = ramp(t, 2), n = Math.min(cols * rows, Math.floor(upto));
            if (prm.glyphs === 'letters') {
              ctx.font = 'bold ' + Math.round(ch * 1.05) + 'px monospace';
              ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            }
            ctx.lineCap = 'butt';
            for (let k = 0; k < n; k++) {
              const i = k % cols, j = Math.floor(k / cols);
              const x = (i + 0.5) * cw, y = (j + 0.5) * ch;
              let v = tone[k];
              if (a > 0) v = clamp(v + a * 0.16 * Math.sin(Math.hypot(x - rx, y - ry) / (W * 0.035) - t * 1.6), 0, 1);
              const lv = clamp(Math.round((1 - v) * 9), 0, 9);
              if (!lv) continue;
              const col = prm.colour === 'tone' ? darks[Math.min(darks.length - 1, Math.floor(v * darks.length))].hex : ink;
              ctx.fillStyle = col; ctx.strokeStyle = col;
              if (prm.glyphs === 'letters') ctx.fillText(LETTERS[lv], x, y);
              else glyph(ctx, lv, x, y);
            }
          },
        };
      },
    },
  };
  const ORDER = ['kelly', 'molnar', 'nees', 'morellet', 'vasarely', 'zebra', 'riley', 'escher', 'coxeter', 'mohr', 'hobbs', 'reas', 'knowlton'];
  const defaults = (style) => Object.fromEntries(STYLES[style].params.map((p) => [p.k, p.def]));
  function cleanParam(p, v) {
    if (p.opts) return p.opts.some((o) => o[0] === v) ? v : p.def;
    const n = Number(v);
    return Number.isFinite(n) ? clamp(Math.round(n / p.step) * p.step, p.min, p.max) : p.def;
  }

  // ---------- state ----------
  const ADJ = ['quiet', 'amber', 'plum', 'tidal', 'paper', 'slow', 'bright', 'hollow', 'woven', 'folded', 'salt', 'velvet', 'copper', 'misty', 'sunlit', 'inky', 'chalk', 'violet', 'rust', 'silver'];
  const NOUN = ['grid', 'loom', 'tide', 'field', 'square', 'line', 'wave', 'moth', 'kite', 'reed', 'orchard', 'window', 'harbour', 'garden', 'thread', 'lantern', 'pebble', 'meadow', 'ribbon', 'prism'];
  const dice = () => ADJ[Math.floor(R() * ADJ.length)] + '-' + NOUN[Math.floor(R() * NOUN.length)] + '-' + (100 + Math.floor(R() * 900));

  const S = {
    seed: '',
    style: 'kelly',
    params: Object.fromEntries(ORDER.map((s) => [s, defaults(s)])),
    photo: null,          // { pal: canonical palette, lum: 160 hex digits, tone: 4000 hex digits, name }
    last: null,           // what the last build decided
  };

  const palette = () => (S.photo ? S.photo.pal : seededPalette()).map(mkColor);
  function lumSampler() {
    if (S.photo && S.photo.lum) return mapSampler(S.photo.lum, LUM_COLS, LUM_ROWS);
    const nz = makeNoise(rngFor('light'));
    return (u, v) => clamp(0.5 + 0.5 * nz(u * 2.2, v * 2.2), 0, 1);
  }
  function toneSampler(lumAt) {
    if (S.photo && S.photo.tone) return mapSampler(S.photo.tone, TONE_COLS, TONE_ROWS);
    if (S.photo) return lumAt;
    const nz = makeNoise(rngFor('tone'));
    return (u, v) => clamp(lumAt(u, v) * 0.75 + 0.25 * (0.5 + 0.5 * nz(u * 9, v * 9)), 0, 1);
  }

  // ---------- SVG export ----------
  // A stand-in for the canvas's 2D context that writes SVG instead of pixels. Every style
  // paints through the handful of calls below, so any picture can be saved as vectors.
  // Arcs become short straight segments; Process, which builds up pixels, goes in as an
  // embedded image.
  function svgContext() {
    const out = [], defs = [], stack = [];
    let m = [1, 0, 0, 1, 0, 0], path = '', open = 0, clips = 0;
    const r1 = (v) => Math.round(v * 10) / 10;
    const pt = (x, y) => r1(m[0] * x + m[2] * y + m[4]) + ' ' + r1(m[1] * x + m[3] * y + m[5]);
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const props = ['fillStyle', 'strokeStyle', 'lineWidth', 'lineJoin', 'lineCap', 'globalAlpha', 'globalCompositeOperation', 'font', 'textAlign', 'textBaseline', 'shadowColor', 'shadowBlur'];
    const look = (c) => {
      let s = '';
      if (c.globalAlpha < 1) s += ' opacity="' + Math.round(c.globalAlpha * 1000) / 1000 + '"';
      if (c.globalCompositeOperation === 'multiply') s += ' style="mix-blend-mode:multiply"';
      return s;
    };
    const c = {
      fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, lineJoin: 'miter', lineCap: 'butt',
      globalAlpha: 1, globalCompositeOperation: 'source-over', font: '10px sans-serif',
      textAlign: 'start', textBaseline: 'alphabetic', shadowColor: '', shadowBlur: 0,
      save() { stack.push({ m: m.slice(), open, p: props.map((k) => c[k]) }); open = 0; },
      restore() {
        out.push('</g>'.repeat(open));
        const s = stack.pop();
        if (!s) return;
        m = s.m; open = s.open; props.forEach((k, i) => { c[k] = s.p[i]; });
      },
      setTransform(a, b, cc, d, e, f) { m = [a, b, cc, d, e, f]; },
      transform(a, b, cc, d, e, f) {
        m = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * cc + m[2] * d, m[1] * cc + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]];
      },
      translate(x, y) { c.transform(1, 0, 0, 1, x, y); },
      rotate(a) { c.transform(Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0); },
      scale(x, y) { c.transform(x, 0, 0, y, 0, 0); },
      beginPath() { path = ''; },
      moveTo(x, y) { path += 'M' + pt(x, y); },
      lineTo(x, y) { path += (path ? 'L' : 'M') + pt(x, y); },
      closePath() { path += 'Z'; },
      rect(x, y, w, h) { path += 'M' + pt(x, y) + 'L' + pt(x + w, y) + 'L' + pt(x + w, y + h) + 'L' + pt(x, y + h) + 'Z'; },
      arc(x, y, r, a0, a1, ccw) {
        let span = a1 - a0;
        if (ccw && span > 0) span -= TAU;
        const n = Math.max(8, Math.ceil(Math.abs(span) / TAU * 48));
        for (let i = 0; i <= n; i++) {
          const a = a0 + span * i / n;
          path += (i === 0 && (!path || path.endsWith('Z')) ? 'M' : 'L') + pt(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
      },
      fill() { if (path) out.push('<path d="' + path + '" fill="' + c.fillStyle + '"' + look(c) + '/>'); },
      stroke() {
        if (!path) return;
        const w = c.lineWidth * Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
        out.push('<path d="' + path + '" fill="none" stroke="' + c.strokeStyle + '" stroke-width="' + r1(w) + '" stroke-linejoin="' + c.lineJoin + '" stroke-linecap="' + c.lineCap + '"' + look(c) + '/>');
      },
      fillRect(x, y, w, h) { const p = path; path = ''; c.rect(x, y, w, h); c.fill(); path = p; },
      strokeRect(x, y, w, h) { const p = path; path = ''; c.rect(x, y, w, h); c.stroke(); path = p; },
      clip() {
        const id = 'k' + clips++;
        defs.push('<clipPath id="' + id + '"><path d="' + path + '"/></clipPath>');
        out.push('<g clip-path="url(#' + id + ')">');
        open++;
      },
      fillText(text, x, y) {
        const anchor = c.textAlign === 'center' ? 'middle' : c.textAlign === 'right' || c.textAlign === 'end' ? 'end' : 'start';
        const base = c.textBaseline === 'middle' ? 'central' : 'alphabetic';
        out.push('<text transform="matrix(' + m.map((v) => Math.round(v * 1000) / 1000).join(' ') + ')" x="' + r1(x) + '" y="' + r1(y) + '" fill="' + c.fillStyle + '" style="font:' + esc(c.font) + '" text-anchor="' + anchor + '" dominant-baseline="' + base + '"' + look(c) + '>' + esc(text) + '</text>');
      },
      drawImage(img, x = 0, y = 0, w = img.width, h = img.height) {
        out.push('<image href="' + img.toDataURL('image/png') + '" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" transform="matrix(' + m.join(' ') + ')"' + look(c) + '/>');
      },
      result() {
        while (stack.length) c.restore();
        out.push('</g>'.repeat(open));
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">' +
          '<defs>' + defs.join('') + '</defs>' + out.join('') + '</svg>';
      },
    };
    return c;
  }
  function pictureSvg(scene, t) {
    const svg = svgContext();
    svg.save();
    scene.paint(svg, t, scene.total);
    svg.restore();
    return svg.result();
  }


  // ---------- the picture, built ----------
  /* Every random decision for the current seed, style, settings and palette, made up
     front: the scene, ready to paint(ctx, t, upto), and the palette it used. */
  function buildScene() {
    const P = palette();
    const ground = P[0];
    let inks = P.slice(1);
    if (!inks.length) inks = [mkColor({ hex: luma(ground.rgb) > 128 ? '#1c1b19' : '#f4f1ea', w: 1 })];
    const style = STYLES[S.style];
    const lumAt = lumSampler();
    const scene = style.build({
      rng: rngFor(S.style),
      rngA: rngFor(S.style + '|move'),
      noise: makeNoise(rngFor(S.style + '|noise')),
      P, ground, inks, lumAt,
      toneAt: toneSampler(lumAt),
      prm: Object.assign(defaults(S.style), S.params[S.style]),
    });
    S.last = scene.info;
    return { scene, P };
  }

  // ---------- the picture as a link, and as kept ----------
  /* The share link's query: the seed, the style, its settings and a photo's palette and
     maps. It is the whole picture. */
  function toQuery() {
    const q = new URLSearchParams();
    q.set('seed', S.seed);
    q.set('style', S.style);
    const prm = S.params[S.style];
    STYLES[S.style].params.forEach((p) => q.set(p.k, prm[p.k]));
    if (S.photo) {
      q.set('pal', encodePal(S.photo.pal));
      if (S.photo.lum) q.set('lum', S.photo.lum);
      if (S.photo.tone && S.style === 'knowlton') q.set('tone', S.photo.tone);   // only the mosaic needs it
    }
    return q.toString();
  }
  function fromQuery(str) {
    const q = new URLSearchParams(str);
    S.seed = q.get('seed') || dice();
    if (STYLES[q.get('style')]) S.style = q.get('style');
    STYLES[S.style].params.forEach((p) => { if (q.has(p.k)) S.params[S.style][p.k] = cleanParam(p, q.get(p.k)); });
    const pal = decodePal(q.get('pal'));
    S.photo = pal ? { pal, lum: validMap(q.get('lum'), LUM_COLS * LUM_ROWS), tone: validMap(q.get('tone'), TONE_COLS * TONE_ROWS), name: null } : null;
    return true;
  }
  function toSave(moving) {
    return {
      seed: S.seed, style: S.style, params: S.params, moving,
      photo: S.photo && { pal: encodePal(S.photo.pal), lum: S.photo.lum, tone: S.photo.tone, name: S.photo.name, edited: !!S.photo.edited },
    };
  }
  function fromSave(d) {
    if (typeof d.seed === 'string' && d.seed) S.seed = d.seed;
    if (STYLES[d.style]) S.style = d.style;
    ORDER.forEach((s) => STYLES[s].params.forEach((p) => {
      if (d.params && d.params[s] && p.k in d.params[s]) S.params[s][p.k] = cleanParam(p, d.params[s][p.k]);
    }));
    const pal = d.photo && decodePal(d.photo.pal);
    S.photo = pal ? {
      pal, lum: validMap(d.photo.lum, LUM_COLS * LUM_ROWS), tone: validMap(d.photo.tone, TONE_COLS * TONE_ROWS), name: d.photo.name || null, edited: !!d.photo.edited,
    } : null;
    return !!S.seed;
  }


  return {
    hashString, mulberry32, shuffle, gauss, makeNoise, hsl, pickWeighted, decodePal, seededPalette, analyse, mapSampler, allocate, hatch, ribbon, cleanParam, lumSampler, toneSampler, svgContext, pictureSvg, buildScene, toQuery, fromQuery, toSave, fromSave, W, H, LUM_COLS, LUM_ROWS, TONE_COLS, TONE_ROWS, ANALYSE_MAX, K, TAU, PI_DIGITS, rngFor, clamp, ease, ramp, hexToRgb, rgbToHex, luma, mix, mkColor, lightest, darkest, contrasting, canon, encodePal, validMap, STYLES, ORDER, defaults, ADJ, NOUN, dice, S, palette,
  };
}
