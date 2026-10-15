/* Physics Playground: the chaos pendulum. The pendulum on a blueprint, its lower bob's
   trail (coloured along its length), the ghosts started a hair apart, and two graphs:
   the two angles against each other (a square, since both wrap), and how far the first
   ghost has drifted from the pendulum, on a log scale, which climbs in a straight-ish line
   while chaos doubles the gap at a steady rate. Drag a bob to set it. See sim.js. */
import { PEND_PARAMS } from './sim.js';

// ---------- constants ----------
const INK = '#d7ecff', GRID = 'rgba(140, 190, 255, 0.10)', AXIS = 'rgba(160, 205, 255, 0.35)';
const GHOST_HUES = [190, 320, 45, 140, 270, 15, 100, 230, 350, 70, 170, 290];
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function createPendulumView({ sim, canvas, g, fit, save }) {
  let L = null;
  function layout() {
    const cw = canvas.width, ch = canvas.height, d = fit.dpr;
    const pad = 16 * d;
    let pend, phase, sep;
    if (cw / ch > 1.2) {
      const gw = Math.min(cw * 0.36, ch * 0.62);
      pend = { x: 0, y: 0, w: cw - gw - pad, h: ch };
      const side = Math.min(gw - pad, (ch - pad * 3) * 0.6);
      phase = { x: cw - gw, y: pad, w: side, h: side };
      sep = { x: cw - gw, y: pad * 2 + side, w: gw - pad, h: ch - side - pad * 3 };
    } else {
      const gh = Math.min(ch * 0.36, cw * 0.5);
      pend = { x: 0, y: 0, w: cw, h: ch - gh - pad };
      const side = Math.min(gh - pad, cw * 0.42);
      phase = { x: pad, y: ch - gh, w: side, h: side };
      sep = { x: pad * 2 + side, y: ch - gh, w: cw - side - pad * 3, h: side };
    }
    const reach = sim.l1 + Math.max(sim.l2, 0.3);
    const scale = Math.min(pend.w, pend.h) * 0.46 / reach;
    L = { pend, phase, sep, scale, px: pend.x + pend.w / 2, py: pend.y + pend.h / 2 - reach * scale * 0.05, d };
  }
  function resize() { layout(); }
  const toPx = (x, y) => [L.px + x * L.scale, L.py + y * L.scale];

  function draw() {
    layout();
    const { d } = L;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#0b1830'; g.fillRect(0, 0, canvas.width, canvas.height);
    // blueprint grid
    g.strokeStyle = GRID; g.lineWidth = 1;
    const step = 32 * d;
    g.beginPath();
    for (let x = (L.px % step); x < canvas.width; x += step) { g.moveTo(x, 0); g.lineTo(x, canvas.height); }
    for (let y = (L.py % step); y < canvas.height; y += step) { g.moveTo(0, y); g.lineTo(canvas.width, y); }
    g.stroke();
    // reach circle
    g.strokeStyle = 'rgba(160, 205, 255, 0.12)'; g.setLineDash([4 * d, 6 * d]);
    g.beginPath(); g.arc(L.px, L.py, (sim.l1 + sim.l2) * L.scale, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);

    // the trail
    const tr = sim.trace, n = Math.floor(tr.length * sim.trail);
    if (n > 2) {
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (let i = tr.length - n + 1; i < tr.length; i++) {
        const age = (tr.length - i) / n;
        const [x0, y0] = toPx(...tr[i - 1]), [x1, y1] = toPx(...tr[i]);
        g.strokeStyle = `hsla(${(i * 0.4) % 360}, 95%, 65%, ${(1 - age) * 0.85})`;
        g.lineWidth = (1 + 2.2 * (1 - age)) * d;
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      }
    }
    // ghosts, then the pendulum itself
    sim.bobs.forEach((b, k) => {
      if (k === 0) return;
      const [x1, y1, x2, y2] = sim.joints(b);
      const hue = GHOST_HUES[(k - 1) % GHOST_HUES.length];
      g.strokeStyle = `hsla(${hue}, 90%, 70%, 0.35)`; g.lineWidth = 1.5 * d;
      g.beginPath(); g.moveTo(L.px, L.py); g.lineTo(...toPx(x1, y1)); g.lineTo(...toPx(x2, y2)); g.stroke();
      g.fillStyle = `hsla(${hue}, 90%, 70%, 0.55)`;
      g.beginPath(); g.arc(...toPx(x2, y2), 5 * d, 0, Math.PI * 2); g.fill();
    });
    const m = sim.bobs[0];
    const [x1, y1, x2, y2] = sim.joints(m);
    const [a1, b1] = toPx(x1, y1), [a2, b2] = toPx(x2, y2);
    g.strokeStyle = INK; g.lineWidth = 3 * d; g.lineCap = 'round';
    g.beginPath(); g.moveTo(L.px, L.py); g.lineTo(a1, b1); g.lineTo(a2, b2); g.stroke();
    const r1 = (9 + 5 * Math.sqrt(sim.m1)) * d, r2 = (9 + 5 * Math.sqrt(sim.m2)) * d;
    bob(a1, b1, r1, '#ffd166', sim.held === 1);
    bob(a2, b2, r2, '#ff5fa2', sim.held === 2);
    g.fillStyle = INK; g.beginPath(); g.arc(L.px, L.py, 5 * d, 0, Math.PI * 2); g.fill();

    phasePlot(L.phase);
    sepPlot(L.sep);
    // readout
    g.fillStyle = 'rgba(215, 236, 255, 0.75)';
    g.font = `${12 * d}px "JetBrains Mono", monospace`;
    g.textBaseline = 'top';
    g.fillText(`t ${sim.t.toFixed(1)} s   energy ${sim.energy().toFixed(2)} J`, L.pend.x + 16 * d, L.pend.y + 14 * d);
  }
  function bob(x, y, r, col, held) {
    const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, col); gr.addColorStop(1, shadeOf(col));
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    if (held) { g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2 * L.d; g.beginPath(); g.arc(x, y, r + 5 * L.d, 0, Math.PI * 2); g.stroke(); }
  }
  function frame(R, title) {
    const d = L.d;
    g.fillStyle = 'rgba(6, 14, 30, 0.75)'; g.strokeStyle = AXIS; g.lineWidth = 1;
    g.fillRect(R.x, R.y, R.w, R.h); g.strokeRect(R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1);
    g.fillStyle = 'rgba(215, 236, 255, 0.7)'; g.font = `${11 * d}px "JetBrains Mono", monospace`; g.textBaseline = 'top';
    g.fillText(title, R.x + 8 * d, R.y + 6 * d);
  }
  function phasePlot(R) {
    if (R.w < 40 || R.h < 40) return;
    frame(R, 'θ₁ against θ₂');
    const d = L.d;
    const X = (a) => R.x + (a / Math.PI + 1) / 2 * R.w, Y = (b) => R.y + (1 - (b / Math.PI + 1) / 2) * R.h;
    g.strokeStyle = 'rgba(160, 205, 255, 0.18)';
    g.beginPath(); g.moveTo(R.x, Y(0)); g.lineTo(R.x + R.w, Y(0)); g.moveTo(X(0), R.y); g.lineTo(X(0), R.y + R.h); g.stroke();
    const h = sim.hist;
    for (let i = 1; i < h.length; i++) {
      const [p0, q0] = h[i - 1], [p1, q1] = h[i];
      if (Math.abs(p1 - p0) > Math.PI || Math.abs(q1 - q0) > Math.PI) continue;
      g.strokeStyle = `rgba(255, 95, 162, ${0.15 + 0.85 * i / h.length})`; g.lineWidth = 1.4 * d;
      g.beginPath(); g.moveTo(X(p0), Y(q0)); g.lineTo(X(p1), Y(q1)); g.stroke();
    }
    if (h.length) { const [p, qq] = h[h.length - 1]; g.fillStyle = '#fff'; g.beginPath(); g.arc(X(p), Y(qq), 3 * d, 0, Math.PI * 2); g.fill(); }
  }
  function sepPlot(R) {
    if (R.w < 60 || R.h < 40) return;
    frame(R, sim.bobs.length > 1 ? 'ghost drift, log₁₀ rad' : 'add a ghost to see the drift');
    const d = L.d, lo = -4, hi = 1;
    const Y = (v) => R.y + R.h - 8 * d - (clamp(v, lo, hi) - lo) / (hi - lo) * (R.h - 30 * d);
    g.font = `${10 * d}px "JetBrains Mono", monospace`; g.textBaseline = 'middle';
    for (let v = lo; v <= hi; v++) {
      g.strokeStyle = 'rgba(160, 205, 255, 0.12)';
      g.beginPath(); g.moveTo(R.x + 30 * d, Y(v)); g.lineTo(R.x + R.w - 6 * d, Y(v)); g.stroke();
      g.fillStyle = 'rgba(215, 236, 255, 0.5)'; g.fillText(v === 0 ? '1' : '10' + sup(v), R.x + 6 * d, Y(v));
    }
    const s = sim.sep;
    if (s.length < 2) return;
    g.strokeStyle = '#7cf2c8'; g.lineWidth = 1.8 * d;
    g.beginPath();
    const x0 = R.x + 30 * d, w = R.w - 36 * d;
    for (let i = 0; i < s.length; i++) { const x = x0 + w * i / 599; if (i) g.lineTo(x, Y(s[i])); else g.moveTo(x, Y(s[i])); }
    g.stroke();
  }

  // ---------- input ----------
  function down(p) {
    layout();
    const m = sim.bobs[0];
    const [x1, y1, x2, y2] = sim.joints(m);
    const [a1, b1] = toPx(x1, y1), [a2, b2] = toPx(x2, y2);
    const reach = 36 * L.d;
    const d2 = Math.hypot(p.cx - a2, p.cy - b2), d1 = Math.hypot(p.cx - a1, p.cy - b1);
    if (d2 < reach && d2 <= d1) sim.grab(2); else if (d1 < reach) sim.grab(1); else return;
    move(p, null, true);
  }
  function move(p, e, held) {
    if (!held || !sim.held) return;
    sim.moveTo((p.cx - L.px) / L.scale, (p.cy - L.py) / L.scale);
  }
  function up() { sim.let_go(); }
  function key(e, isDown) {
    if (!isDown) return false;
    if (e.key === ' ') { pauseBtn.click(); return true; }
    return false;
  }

  // ---------- controls ----------
  const box = document.getElementById('pd-sliders');
  const inputs = {};
  for (const [k, p] of Object.entries(PEND_PARAMS)) {
    const lab = document.createElement('label');
    lab.className = 'slider';
    lab.textContent = p.name + ' ';
    const inp = document.createElement('input');
    inp.type = 'range'; inp.min = p.min; inp.max = p.max; inp.step = p.step; inp.value = sim[k];
    inp.addEventListener('input', () => { sim.set(k, inp.value); save(); });
    lab.appendChild(inp);
    box.appendChild(lab);
    inputs[k] = inp;
  }
  document.getElementById('pd-drop').addEventListener('click', () => sim.start(Math.PI - 0.02, Math.PI - 0.01));
  document.getElementById('pd-random').addEventListener('click', () => sim.start((Math.random() * 2 - 1) * Math.PI, (Math.random() * 2 - 1) * Math.PI));
  const pauseBtn = document.getElementById('pd-pause');
  pauseBtn.addEventListener('click', () => { sim.paused = !sim.paused; pauseBtn.setAttribute('aria-pressed', String(sim.paused)); pauseBtn.textContent = sim.paused ? 'Go on' : 'Pause'; });
  function show() { for (const [k, inp] of Object.entries(inputs)) inp.value = sim[k]; }

  return { draw, down, move, up, key, resize, show };
}
function shadeOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) * 0.45 | 0}, ${((n >> 8) & 255) * 0.45 | 0}, ${(n & 255) * 0.45 | 0})`;
}
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴' };
const sup = (v) => String(v).split('').map((c) => SUP[c] || c).join('');
