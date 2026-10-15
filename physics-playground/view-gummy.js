/* Physics Playground: the gummy bears' table. Each bear is drawn as one smooth implicit
   surface: a field summed over its mass points and its stretchy strands (capsules whose
   radius thins as they are pulled), so head, ears, snout, body and limbs melt into one
   piece of candy. The field is shaded per pixel at reduced resolution: its value stands
   in for thickness (the candy absorbs more light, and goes deeper and darker, where it is
   thick), its slope for the surface normal (refracting the gingham behind, a fresnel rim,
   light glowing through the far edge, a sharp clearcoat highlight). The table, the
   shadows (tinted by each bear's own colour) and the molded eyes are drawn crisp on top.
   See sim.js for the soft bodies. */
import { STRANDS, GUMMY_COLOURS } from './sim.js';

// ---------- constants ----------
const T = 0.28;                 // the surface: where the field crosses this
const REACH = 1.7;              // a kernel reaches this many radii out
const DOME = 20;                // how tall the candy stands, in world units, for its normals
const FIELD_PX = 420000;        // the field is shaded at no more than this many pixels
const L = norm([-0.45, -0.7, 0.62]);
const HV = norm([L[0], L[1], L[2] + 1]);
const BACK = norm([0.5, 0.75, 0.3]);
function norm(v) { const l = Math.hypot(...v); return v.map((x) => x / l); }
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function createGummyView({ sim, canvas, g, fit, audio, save, W, H }) {
  const low = document.createElement('canvas');
  const lg = low.getContext('2d', { willReadFrequently: true });
  let q = 1, img = null, bgLow = null, bgFull = null, field = new Float32Array(0);
  let colour = 0;

  // ---------- the table ----------
  function paintBackground() {
    bgFull = document.createElement('canvas');
    bgFull.width = canvas.width; bgFull.height = canvas.height;
    const b = bgFull.getContext('2d');
    const { s, ox, oy } = fit;
    const Y = (y) => oy + y * s;
    const top = Y(sim.FLOOR - 84);
    // the wall: warm cream with a soft stripe
    const wall = b.createLinearGradient(0, 0, 0, top);
    wall.addColorStop(0, '#f3e6da'); wall.addColorStop(1, '#f8efe5');
    b.fillStyle = wall; b.fillRect(0, 0, bgFull.width, top);
    b.fillStyle = 'rgba(214, 170, 160, 0.18)';
    const stripe = 46 * s;
    for (let x = ox % (stripe * 2) - stripe * 2; x < bgFull.width; x += stripe * 2) b.fillRect(x, 0, stripe * 0.5, top);
    // a light from the window, top left
    const glow = b.createRadialGradient(ox + 160 * s, oy - 60 * s, 10, ox + 160 * s, oy - 60 * s, 900 * s);
    glow.addColorStop(0, 'rgba(255, 250, 235, 0.75)'); glow.addColorStop(1, 'rgba(255, 250, 235, 0)');
    b.fillStyle = glow; b.fillRect(0, 0, bgFull.width, top);
    // the table: pink gingham, receding a little
    b.fillStyle = '#fbf3f1'; b.fillRect(0, top, bgFull.width, bgFull.height - top);
    const rows = 9;
    for (let r = 0; r < rows; r++) {
      const y0 = top + (bgFull.height - top) * Math.pow(r / rows, 1.25), y1 = top + (bgFull.height - top) * Math.pow((r + 0.5) / rows, 1.25);
      b.fillStyle = 'rgba(232, 112, 140, 0.32)'; b.fillRect(0, y0, bgFull.width, y1 - y0);
    }
    const cell = 34 * s;
    for (let x = ox % (cell * 2) - cell * 2; x < bgFull.width; x += cell * 2) {
      b.fillStyle = 'rgba(232, 112, 140, 0.32)';
      b.beginPath();
      // columns lean out from the middle, as a tablecloth seen from above the front
      const mid = bgFull.width / 2, lean = (x - mid) * 0.18;
      b.moveTo(x, top); b.lineTo(x + cell, top); b.lineTo(x + cell + lean, bgFull.height); b.lineTo(x + lean, bgFull.height); b.closePath(); b.fill();
    }
    // where the wall meets the table
    const edge = b.createLinearGradient(0, top - 6, 0, top + 18);
    edge.addColorStop(0, 'rgba(120, 70, 60, 0)'); edge.addColorStop(0.3, 'rgba(120, 70, 60, 0.18)'); edge.addColorStop(1, 'rgba(120, 70, 60, 0)');
    b.fillStyle = edge; b.fillRect(0, top - 6, bgFull.width, 24);
    // the low-resolution copy the candy refracts
    lg.drawImage(bgFull, 0, 0, low.width, low.height);
    bgLow = lg.getImageData(0, 0, low.width, low.height).data.slice();
  }
  function resize() {
    q = Math.min(1, Math.sqrt(FIELD_PX / (canvas.width * canvas.height)));
    low.width = Math.max(1, Math.round(canvas.width * q)); low.height = Math.max(1, Math.round(canvas.height * q));
    img = lg.createImageData(low.width, low.height);
    field = new Float32Array(low.width * low.height);
    // the side walls are the edges of the screen, not of the 1200-wide world
    sim.setBounds(-fit.ox / fit.s, (canvas.width - fit.ox) / fit.s);
    paintBackground();
  }

  // ---------- one bear's field, shaded into the low buffer ----------
  function shadeBear(bear) {
    const ppw = fit.s * q;                       // low pixels per world unit
    const LX = (x) => (x * fit.s + fit.ox) * q, LY = (y) => (y * fit.s + fit.oy) * q;
    const ks = bear.p.map((p) => [LX(p.x), LY(p.y), (p.r * REACH * ppw) ** 2]);
    const ss = STRANDS.map(([, i, j], n) => {
      const r = sim.strandRadius(bear, n) * REACH * ppw;
      const a = bear.p[i], b = bear.p[j];
      return [LX(a.x), LY(a.y), LX(b.x), LY(b.y), r * r];
    });
    const [bx0, by0, bx1, by1] = sim.bbox(bear);
    const pad = 22;
    const x0 = clamp(Math.floor(LX(bx0 - pad)), 1, low.width - 2), x1 = clamp(Math.ceil(LX(bx1 + pad)), 1, low.width - 2);
    const y0 = clamp(Math.floor(LY(by0 - pad)), 1, low.height - 2), y1 = clamp(Math.ceil(LY(by1 + pad)), 1, low.height - 2);
    if (x1 <= x0 || y1 <= y0) return;
    const LW = low.width;
    for (let y = y0 - 1; y <= y1 + 1; y++) {
      for (let x = x0 - 1; x <= x1 + 1; x++) {
        let f = 0;
        for (let k = 0; k < ks.length; k++) {
          const c = ks[k], dx = x - c[0], dy = y - c[1], d2 = dx * dx + dy * dy;
          if (d2 < c[2]) { const t = 1 - d2 / c[2]; f += t * t * t; }
        }
        for (let k = 0; k < ss.length; k++) {
          const c = ss[k], ex = c[2] - c[0], ey = c[3] - c[1], l2 = ex * ex + ey * ey;
          let t = l2 ? ((x - c[0]) * ex + (y - c[1]) * ey) / l2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const dx = x - c[0] - ex * t, dy = y - c[1] - ey * t, d2 = dx * dx + dy * dy;
          if (d2 < c[4]) { const u = 1 - d2 / c[4]; f += u * u * u * 0.9; }
        }
        field[y * LW + x] = f;
      }
    }
    const col = GUMMY_COLOURS[bear.colour];
    const cr = col.rgb[0] / 255, cg = col.rgb[1] / 255, cb = col.rgb[2] / 255, ab = col.absorb;
    const D = img.data, aa = 0.07;
    const refr = 9 * ppw;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * LW + x, f = field[i];
        if (f <= T) continue;
        const a = f - T >= aa ? 1 : (f - T) / aa;
        // thickness and the dome both saturate: steep at the edge, smooth inside, so the
        // places where the point kernels overlap do not show as creases
        const th = 1.25 * (1 - Math.exp(-(f - T) * 1.5));
        const gx = (field[i + 1] - field[i - 1]) * 0.5 * ppw, gy = (field[i + LW] - field[i - LW]) * 0.5 * ppw;
        const k = DOME * Math.exp(-(f - T) / 0.22) / 0.22;
        let nx = -gx * k, ny = -gy * k, nz = 1;
        const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
        // what is behind, bent by the surface
        const sx = clamp(Math.round(x - nx * refr * (0.5 + th)), 0, LW - 1), sy = clamp(Math.round(y - ny * refr * (0.5 + th)), 0, low.height - 1);
        const si = (sy * LW + sx) * 4;
        const e = 1 + 3.4 * th * ab;
        const tr = Math.pow(cr, e), tg = Math.pow(cg, e), tb = Math.pow(cb, e);
        const dif = 0.74 + 0.36 * Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
        let r = (bgLow[si] * tr * 0.82 + 255 * cr * 0.16 * (1 - th * 0.45)) * dif;
        let gg = (bgLow[si + 1] * tg * 0.82 + 255 * cg * 0.16 * (1 - th * 0.45)) * dif;
        let bb = (bgLow[si + 2] * tb * 0.82 + 255 * cb * 0.16 * (1 - th * 0.45)) * dif;
        // light coming through the far side glows near the lower edge
        const back = Math.max(0, nx * BACK[0] + ny * BACK[1]) * (1 - Math.min(1, th)) * 0.9;
        r += 255 * cr * back * 0.32; gg += 255 * cg * back * 0.32; bb += 255 * cb * back * 0.32;
        // fresnel rim and the clearcoat
        const fr = Math.pow(1 - nz, 3) * 0.16;
        const h = Math.max(0, nx * HV[0] + ny * HV[1] + nz * HV[2]);
        const spec = Math.pow(h, 110) * 1.7 + Math.pow(h, 16) * 0.1;
        r += 255 * (fr * (0.3 + 0.7 * cr) + spec); gg += 255 * (fr * (0.3 + 0.7 * cg) + spec); bb += 255 * (fr * (0.3 + 0.7 * cb) + spec);
        const o = i * 4, inv = 1 - a;
        D[o] = Math.min(255, r) * a + D[o] * inv;
        D[o + 1] = Math.min(255, gg) * a + D[o + 1] * inv;
        D[o + 2] = Math.min(255, bb) * a + D[o + 2] * inv;
        D[o + 3] = 255 * a + D[o + 3] * inv;
      }
    }
  }

  // ---------- crisp bits: shadows, eyes, a glint ----------
  function shadows() {
    const { s, ox, oy } = fit;
    for (const b of sim.bears) {
      const [x0, , x1, y1] = sim.bbox(b);
      const lift = Math.max(0, sim.FLOOR - y1);
      const a = 0.5 * clamp(1 - lift / 320, 0, 1);
      if (a <= 0.01) continue;
      const [cr, cg, cb] = GUMMY_COLOURS[b.colour].rgb;
      const cx = ox + ((x0 + x1) / 2 + 14 + lift * 0.2) * s, cy = oy + (sim.FLOOR + 3) * s;
      const rx = ((x1 - x0) * 0.55 + lift * 0.15) * s, ry = (10 + lift * 0.04) * s;
      g.save();
      g.translate(cx, cy); g.scale(1, ry / rx);
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, rx);
      grd.addColorStop(0, `rgba(${cr * 0.35 | 0}, ${cg * 0.3 | 0}, ${cb * 0.3 | 0}, ${a})`);
      grd.addColorStop(0.6, `rgba(${cr * 0.5 | 0}, ${cg * 0.45 | 0}, ${cb * 0.45 | 0}, ${a * 0.45})`);
      grd.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
      g.fillStyle = grd; g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill();
      // light focused through the candy: a bright coloured patch inside the shadow
      const c2 = g.createRadialGradient(-rx * 0.15, 0, 0, -rx * 0.15, 0, rx * 0.45);
      c2.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${a * 0.55})`); c2.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
      g.fillStyle = c2; g.beginPath(); g.arc(-rx * 0.15, 0, rx * 0.45, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  }
  function faces() {
    const { s, ox, oy } = fit;
    const P = (x, y) => [ox + x * s, oy + y * s];
    for (const b of sim.bears) {
      const head = b.p[0], snout = b.p[3], belly = b.p[5];
      const ca = Math.cos(b.angle), sa = Math.sin(b.angle);
      const off = (p, x, y) => P(p.x + (x * ca - y * sa) * b.s, p.y + (x * sa + y * ca) * b.s);
      const [cr, cg, cb] = GUMMY_COLOURS[b.colour].rgb;
      const dark = `rgba(${cr * 0.45 | 0}, ${cg * 0.35 | 0}, ${cb * 0.35 | 0}, 0.55)`;
      for (const side of [-1, 1]) {
        const [ex, ey] = off(head, side * 9, -6);
        g.fillStyle = dark; g.beginPath(); g.ellipse(ex, ey, 2.8 * s * b.s, 3.3 * s * b.s, b.angle, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(255, 255, 255, 0.75)'; g.beginPath(); g.arc(ex - 0.9 * s, ey - 1.2 * s, 0.9 * s * b.s, 0, Math.PI * 2); g.fill();
      }
      const [nx, ny] = off(snout, 0, -1);
      g.fillStyle = dark; g.beginPath(); g.ellipse(nx, ny, 3.6 * s * b.s, 2.5 * s * b.s, b.angle, 0, Math.PI * 2); g.fill();
      // crisp clearcoat glints on the head and the belly
      g.fillStyle = 'rgba(255, 255, 255, 0.6)';
      for (const [p, x, y, w, h] of [[head, -11, -11, 5.5, 2.4], [belly, -13, -12, 7, 2.8]]) {
        const [gx, gy] = off(p, x, y);
        g.beginPath(); g.ellipse(gx, gy, w * s * b.s, h * s * b.s, b.angle - 0.7, 0, Math.PI * 2); g.fill();
      }
    }
  }

  function draw() {
    if (!img) resize();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(bgFull, 0, 0);
    shadows();
    img.data.fill(0);
    for (const b of sim.bears) shadeBear(b);
    lg.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(low, 0, 0, canvas.width, canvas.height);
    faces();
  }

  // ---------- input ----------
  function down(p) {
    if (sim.grab(p.x, p.y)) return;
    if (p.y < sim.FLOOR - 10 && p.x > sim.x0 + 30 && p.x < sim.x1 - 30) {
      sim.addBear({ x: p.x, y: Math.min(p.y, 140) - 120, colour });
      audio.tone({ freq: 880, to: 1320, dur: 0.08, type: 'sine', vol: 0.03 });
    }
  }
  function move(p, e, held) { if (held) sim.drag(p.x, p.y); }
  function up() { sim.release(); }
  function key(e, isDown) {
    if (!isDown) return false;
    if (e.key === 't' || e.key === 'T') { sim.thump(1); return true; }
    if (e.key === 'b' || e.key === 'B') { sim.addBear({ colour }); return true; }
    return false;
  }
  function event(name, d) {
    if (name === 'bounce') {
      const v = clamp((d.speed - 380) / 1500, 0, 1);
      audio.tone({ freq: 190 + d.colour * 14, to: 105, dur: 0.18, type: 'sine', vol: 0.03 + 0.1 * v });
      audio.noise({ dur: 0.07, vol: 0.02 + 0.05 * v, filter: 'lowpass', freq: 520 });
    } else if (name === 'grab') {
      audio.tone({ freq: 520, to: 780, dur: 0.07, type: 'triangle', vol: 0.025 });
    } else if (name === 'thump') {
      audio.tone({ freq: 75, to: 40, dur: 0.28, type: 'sine', vol: 0.22 });
      audio.noise({ dur: 0.18, vol: 0.12, filter: 'lowpass', freq: 240 });
    }
  }

  // ---------- controls ----------
  const sw = document.getElementById('gm-colours');
  GUMMY_COLOURS.forEach((c, i) => {
    const b = document.createElement('button');
    b.style.background = `rgb(${c.rgb.join(',')})`;
    b.title = c.name[0].toUpperCase() + c.name.slice(1);
    b.setAttribute('aria-label', b.title);
    b.addEventListener('click', () => { colour = i; syncColours(); });
    sw.appendChild(b);
  });
  function syncColours() { [...sw.children].forEach((b, i) => b.setAttribute('aria-pressed', String(i === colour))); }
  syncColours();
  document.getElementById('gm-add').addEventListener('click', () => { sim.addBear({ colour }); colour = (colour + 1) % GUMMY_COLOURS.length; syncColours(); });
  document.getElementById('gm-thump').addEventListener('click', () => sim.thump(1));
  document.getElementById('gm-clear').addEventListener('click', () => sim.clear());
  const jig = document.getElementById('gm-jiggle');
  jig.value = sim.jiggle;
  jig.addEventListener('input', () => { sim.setJiggle(jig.value); save(); });

  return { draw, down, move, up, key, event, resize, debug: { shadeBear, get q() { return q; } } };
}
