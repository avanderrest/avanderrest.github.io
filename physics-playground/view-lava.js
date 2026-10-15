/* Physics Playground: the lava. The particles are drawn as metaballs: a field summed
   from a soft kernel round each one, at reduced resolution, and wherever it crosses the
   surface value the lava begins. Its colour comes from the particles' own heat, averaged
   through the same field (cold is a dark crust-red, hot is orange to a yellow core), with
   a dark crust near the edge, a wet highlight off the field's slope and a glow outside.
   The blade leaves a short white-hot trail. See sim.js for the fluid. */

// ---------- constants ----------
const FIELD_PX = 260000;
const KR = 19;                   // kernel radius, world units
const T = 1.05;                  // the surface
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const COLD = [110, 16, 8], WARM = [214, 52, 10], HOT = [255, 128, 18], CORE = [255, 226, 120];

export function createLavaView({ sim, canvas, g, fit, audio, save, W, H }) {
  const low = document.createElement('canvas');
  const lg = low.getContext('2d');
  let q = 1, img = null, field = null, heat = null, bg = null;
  let tool = 'slice', dragging = false, last = null, trail = [], lastBlobs = 0, blobTimer = 0, lastHiss = 0, clock = 0;

  function resize() {
    q = Math.min(1, Math.sqrt(FIELD_PX / (canvas.width * canvas.height)));
    low.width = Math.max(1, Math.round(canvas.width * q)); low.height = Math.max(1, Math.round(canvas.height * q));
    img = lg.createImageData(low.width, low.height);
    field = new Float32Array(low.width * low.height); heat = new Float32Array(low.width * low.height);
    paintBackground();
  }
  function paintBackground() {
    bg = document.createElement('canvas');
    bg.width = canvas.width; bg.height = canvas.height;
    const b = bg.getContext('2d');
    const gr = b.createLinearGradient(0, 0, 0, bg.height);
    gr.addColorStop(0, '#16110f'); gr.addColorStop(1, '#0b0807');
    b.fillStyle = gr; b.fillRect(0, 0, bg.width, bg.height);
    // basalt grain
    let s = 99;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 1400; i++) {
      b.fillStyle = `rgba(${r() < 0.5 ? '255,220,200' : '0,0,0'}, ${0.02 + r() * 0.04})`;
      b.fillRect(r() * bg.width, r() * bg.height, 1 + r() * 3, 1 + r() * 3);
    }
    // the box the lava lives in
    const { s: k, ox, oy } = fit;
    b.strokeStyle = 'rgba(255, 140, 60, 0.12)'; b.lineWidth = 2;
    b.strokeRect(ox + 1, oy + 1, W * k - 2, H * k - 2);
  }

  function shade() {
    const LW = low.width, LH = low.height, ppw = fit.s * q;
    field.fill(0); heat.fill(0);
    const R = KR * ppw, R2 = R * R, ir = Math.ceil(R);
    const X = sim.x, Y = sim.y, HT = sim.heat;
    for (let i = 0; i < sim.n; i++) {
      const cx = (X[i] * fit.s + fit.ox) * q, cy = (Y[i] * fit.s + fit.oy) * q;
      const x0 = Math.max(0, (cx - ir) | 0), x1 = Math.min(LW - 1, (cx + ir) | 0);
      const y0 = Math.max(0, (cy - ir) | 0), y1 = Math.min(LH - 1, (cy + ir) | 0);
      const h = HT[i];
      for (let y = y0; y <= y1; y++) {
        const dy = y - cy, row = y * LW;
        for (let x = x0; x <= x1; x++) {
          const dx = x - cx, d2 = dx * dx + dy * dy;
          if (d2 >= R2) continue;
          const t = 1 - d2 / R2, w = t * t;
          field[row + x] += w; heat[row + x] += w * h;
        }
      }
    }
    const D = img.data;
    for (let y = 1; y < LH - 1; y++) {
      for (let x = 1; x < LW - 1; x++) {
        const i = y * LW + x, f = field[i], o = i * 4;
        if (f < 0.12) { D[o + 3] = 0; continue; }
        const tt = clamp(heat[i] / f, 0, 1);
        if (f < T) {
          // glow round the outside
          const a = Math.pow(f / T, 2.2) * (0.25 + 0.45 * tt);
          D[o] = 255; D[o + 1] = 70 + 80 * tt; D[o + 2] = 20; D[o + 3] = a * 255;
          continue;
        }
        const depth = f - T;
        let c = tt < 0.5 ? mix(COLD, WARM, tt * 2) : mix(WARM, HOT, (tt - 0.5) * 2);
        c = mix(c, CORE, clamp((depth - 1.2) / 3.5, 0, 1) * (0.35 + 0.65 * tt));
        // crust: the skin cools first
        const crust = clamp(1 - depth / 1.4, 0, 1) * (1 - tt * 0.5);
        c = mix(c, [58, 10, 4], crust * 0.8);
        // wet highlight off the slope
        // a dome that saturates, so single particles inside do not glint
        const gx = (field[i + 1] - field[i - 1]) * 0.5 * ppw, gy = (field[i + LW] - field[i - LW]) * 0.5 * ppw;
        const k = 14 * Math.exp(-depth / 0.5) / 0.5;
        let nx = -gx * k, ny = -gy * k, nz = 1;
        const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
        const hl = Math.max(0, nx * -0.35 + ny * -0.55 + nz * 0.76);
        const spec = Math.pow(hl, 30) * 0.65;
        const edgeAA = clamp(depth / 0.12, 0, 1);
        D[o] = Math.min(255, c[0] + 255 * spec); D[o + 1] = Math.min(255, c[1] + 235 * spec); D[o + 2] = Math.min(255, c[2] + 200 * spec);
        D[o + 3] = 255 * (edgeAA + (1 - edgeAA) * 0.6);
      }
    }
    lg.putImageData(img, 0, 0);
  }

  function draw() {
    if (!img) resize();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(bg, 0, 0);
    // the lamp's heater and its cool top
    const { s, ox, oy } = fit;
    if (sim.lamp) {
      const hot = g.createLinearGradient(0, oy + (H - 110) * s, 0, oy + H * s);
      hot.addColorStop(0, 'rgba(255, 90, 20, 0)'); hot.addColorStop(1, `rgba(255, 110, 30, ${0.35 + 0.08 * Math.sin(clock * 3)})`);
      g.fillStyle = hot; g.fillRect(ox, oy + (H - 110) * s, W * s, 110 * s);
      const cool = g.createLinearGradient(0, oy, 0, oy + 120 * s);
      cool.addColorStop(0, 'rgba(90, 140, 255, 0.12)'); cool.addColorStop(1, 'rgba(90, 140, 255, 0)');
      g.fillStyle = cool; g.fillRect(ox, oy, W * s, 120 * s);
    }
    shade();
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    // a soft bloom under the sharp layer
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.28;
    g.filter = `blur(${Math.round(10 * fit.s)}px)`;
    g.drawImage(low, 0, 0, canvas.width, canvas.height);
    g.filter = 'none';
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.drawImage(low, 0, 0, canvas.width, canvas.height);
    // the blade's trail
    g.setTransform(s, 0, 0, s, ox, oy);
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1], b = trail[i];
      const life = clamp(1 - (clock - b.t) / 0.25, 0, 1);
      if (life <= 0) continue;
      g.strokeStyle = `rgba(255, 250, 220, ${life * 0.9})`; g.lineWidth = 2 + 5 * life;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
  }
  function tick(dt) {
    clock += dt;
    while (trail.length && clock - trail[0].t > 0.3) trail.shift();
    if (dragging && tool === 'pour' && last) sim.pour(last.x + (Math.random() - 0.5) * 10, last.y, 3);
    // blobs coming back together make a sound
    blobTimer += dt;
    if (blobTimer > 0.4) {
      blobTimer = 0;
      const n = sim.blobs(12);
      if (n < lastBlobs) audio.tone({ freq: 140, to: 310, dur: 0.12, type: 'sine', vol: 0.07 });
      lastBlobs = n;
    }
  }

  // ---------- input ----------
  function down(p) {
    dragging = true; last = { x: p.x, y: p.y };
    trail.push({ x: p.x, y: p.y, t: clock });
  }
  function move(p, e, held) {
    if (!held || !dragging) return;
    if (tool === 'slice' && last) {
      sim.blade(last.x, last.y, p.x, p.y, 16);
      trail.push({ x: p.x, y: p.y, t: clock });
    }
    last = { x: p.x, y: p.y };
  }
  function up() { dragging = false; last = null; }
  function event(name) {
    if (name === 'slice' && clock - lastHiss > 0.09) {
      lastHiss = clock;
      audio.noise({ dur: 0.12, vol: 0.05, filter: 'highpass', freq: 2600 });
      audio.noise({ dur: 0.18, vol: 0.04, filter: 'lowpass', freq: 300 });
    } else if (name === 'pour' && clock - lastHiss > 0.2) {
      lastHiss = clock;
      audio.tone({ freq: 90 + Math.random() * 60, to: 200, dur: 0.1, type: 'sine', vol: 0.05 });
    }
  }

  // ---------- controls ----------
  const sliceBtn = document.getElementById('lv-slice'), pourBtn = document.getElementById('lv-pour');
  function setTool(t) { tool = t; sliceBtn.setAttribute('aria-pressed', String(t === 'slice')); pourBtn.setAttribute('aria-pressed', String(t === 'pour')); }
  sliceBtn.addEventListener('click', () => setTool('slice'));
  pourBtn.addEventListener('click', () => setTool('pour'));
  const lamp = document.getElementById('lv-lamp');
  const syncLamp = () => lamp.setAttribute('aria-pressed', String(sim.lamp));
  lamp.addEventListener('click', () => { sim.lamp = !sim.lamp; syncLamp(); save(); });
  syncLamp();
  const grav = document.getElementById('lv-gravity');
  grav.value = sim.gravity;
  grav.addEventListener('input', () => { sim.gravity = +grav.value; save(); });
  document.getElementById('lv-reset').addEventListener('click', () => { sim.reset(); lastBlobs = 0; });
  function show() { syncLamp(); grav.value = sim.gravity; }

  return { draw, tick, down, move, up, event, resize, show, setTool };
}
function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
