/* Physics Playground: the curtains. A window on a plaster wall, with a summer view out of
   it, and two printed linen curtains on a brass rail. Every square of cloth whose four
   threads are whole is drawn as a quad, furthest first, lit by its own normal (the cloth is
   in 3D), the front in its print and the back in its plain lining. Threads left hanging by
   a tear or a cut are drawn as threads. Grab pulls the cloth (or slides a ring along the
   rail); Cut drags a blade through it, as on the lava. See sim.js for the cloth. */

// ---------- constants ----------
const FACE = [196, 92, 58];      // terracotta linen
const PRINT = [244, 214, 160];   // its block-printed stripe and dots
const LINING = [226, 216, 196];
const LIGHT = norm([-0.35, -0.55, 0.76]);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function createCurtainView({ sim, canvas, g, fit, audio, save, W, H }) {
  let bg = null, tool = 'grab', last = null, trail = [], clock = 0, lastRip = 0;
  // which quads each structural thread borders, for drawing loose threads
  let edgeQuads = null;
  function index() {
    edgeQuads = new Map();
    sim.quads.forEach((q, n) => { for (const e of q.e) { if (!edgeQuads.has(e)) edgeQuads.set(e, []); edgeQuads.get(e).push(n); } });
  }

  function paintBackground() {
    bg = document.createElement('canvas');
    bg.width = canvas.width; bg.height = canvas.height;
    const b = bg.getContext('2d'), { s, ox, oy } = fit;
    const X = (x) => ox + x * s, Y = (y) => oy + y * s;
    b.fillStyle = '#e9dcc6'; b.fillRect(0, 0, bg.width, bg.height);
    let seed = 3;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 1600; i++) { b.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '120,90,60'}, ${0.03 + r() * 0.04})`; b.fillRect(r() * bg.width, r() * bg.height, 2 + r() * 4, 2 + r() * 4); }
    // the window: sky, hills, a frame and its glazing bars
    const wx0 = X(260), wy0 = Y(130), ww = 680 * s, wh = 470 * s;
    const sky = b.createLinearGradient(0, wy0, 0, wy0 + wh);
    sky.addColorStop(0, '#6aa8e0'); sky.addColorStop(0.7, '#cfe6f2'); sky.addColorStop(1, '#f2ead0');
    b.fillStyle = sky; b.fillRect(wx0, wy0, ww, wh);
    b.fillStyle = 'rgba(255, 250, 220, 0.9)'; b.beginPath(); b.arc(X(780), Y(220), 34 * s, 0, Math.PI * 2); b.fill();
    for (const [c, base, amp] of [['#8fb37a', 470, 40], ['#6d9a5f', 520, 30], ['#557f4b', 570, 22]]) {
      b.fillStyle = c; b.beginPath(); b.moveTo(wx0, Y(base));
      for (let x = 0; x <= 680; x += 20) b.lineTo(X(260 + x), Y(base - amp * Math.sin(x / 680 * Math.PI * (1.3 + base / 400)) - amp * 0.4 * Math.sin(x / 90)));
      b.lineTo(wx0 + ww, wy0 + wh); b.lineTo(wx0, wy0 + wh); b.closePath(); b.fill();
    }
    b.strokeStyle = '#f7f3ea'; b.lineWidth = 22 * s; b.strokeRect(wx0, wy0, ww, wh);
    b.lineWidth = 9 * s;
    b.beginPath(); b.moveTo(wx0 + ww / 2, wy0); b.lineTo(wx0 + ww / 2, wy0 + wh); b.moveTo(wx0, wy0 + wh * 0.45); b.lineTo(wx0 + ww, wy0 + wh * 0.45); b.stroke();
    b.fillStyle = '#f7f3ea'; b.fillRect(wx0 - 30 * s, wy0 + wh, ww + 60 * s, 16 * s);
    b.fillStyle = 'rgba(0,0,0,0.12)'; b.fillRect(wx0 - 30 * s, wy0 + wh + 16 * s, ww + 60 * s, 6 * s);
    // the floor
    b.fillStyle = '#8a6444'; b.fillRect(0, Y(sim.FLOOR + 8), bg.width, bg.height);
    b.fillStyle = '#6e4e33'; b.fillRect(0, Y(sim.FLOOR + 8), bg.width, 6 * s);
    // the rail
    const ry = Y(sim.RAIL);
    b.strokeStyle = '#b48a3c'; b.lineWidth = 7 * s; b.lineCap = 'round';
    b.beginPath(); b.moveTo(X(sim.RX0 - 30), ry - 6 * s); b.lineTo(X(sim.RX1 + 30), ry - 6 * s); b.stroke();
    b.strokeStyle = 'rgba(255, 240, 200, 0.7)'; b.lineWidth = 2 * s;
    b.beginPath(); b.moveTo(X(sim.RX0 - 30), ry - 8 * s); b.lineTo(X(sim.RX1 + 30), ry - 8 * s); b.stroke();
    b.fillStyle = '#b48a3c';
    for (const x of [sim.RX0 - 40, sim.RX1 + 40]) { b.beginPath(); b.arc(X(x), ry - 6 * s, 11 * s, 0, Math.PI * 2); b.fill(); }
  }
  function resize() { paintBackground(); }

  function colour(q, nz, lit) {
    let c;
    if (nz < 0) c = LINING;
    else {
      // a stripe every fourth column, and dots between
      const stripe = q.c % 4 === 1, dot = q.c % 4 === 3 && q.r % 3 === 1;
      c = stripe || dot ? PRINT : FACE;
      if (q.r === sim.ROWS - 2) c = PRINT;          // the hem
    }
    const k = 0.42 + 0.7 * lit;
    return `rgb(${Math.min(255, c[0] * k) | 0}, ${Math.min(255, c[1] * k) | 0}, ${Math.min(255, c[2] * k) | 0})`;
  }

  function draw() {
    if (!bg) paintBackground();
    if (!edgeQuads) index();
    const { s, ox, oy } = fit;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(bg, 0, 0);
    g.setTransform(s, 0, 0, s, ox, oy);
    const X = sim.x, Y = sim.y, Z = sim.z, cons = sim.cons;
    const list = [], drawn = new Uint8Array(sim.quads.length);
    sim.quads.forEach((q, n) => {
      if (!q.e.every((e) => cons[e].alive)) return;
      drawn[n] = 1;
      const [a, b, f, d] = q.p;
      // the normal from the two diagonals
      const ux = X[f] - X[a], uy = Y[f] - Y[a], uz = Z[f] - Z[a], vx = X[d] - X[b], vy = Y[d] - Y[b], vz = Z[d] - Z[b];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      // facing us is +z (with y down, (f - a) x (d - b) points out of the front)
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      const facing = nz >= 0 ? 1 : -1;
      const lit = Math.max(0, facing * (nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]));
      list.push({ q, z: Z[a] + Z[b] + Z[f] + Z[d], fill: colour(q, nz, lit) });
    });
    list.sort((A, B) => A.z - B.z);
    g.lineJoin = 'round'; g.lineWidth = 0.8;
    for (const { q, fill } of list) {
      const [a, b, f, d] = q.p;
      g.fillStyle = fill; g.strokeStyle = fill;
      g.beginPath(); g.moveTo(X[a], Y[a]); g.lineTo(X[b], Y[b]); g.lineTo(X[f], Y[f]); g.lineTo(X[d], Y[d]); g.closePath();
      g.fill(); g.stroke();
    }
    // loose threads: whole, but with no whole square either side
    g.strokeStyle = 'rgba(150, 70, 40, 0.9)'; g.lineWidth = 1.1;
    g.beginPath();
    cons.forEach((k, n) => {
      if (!k.alive || k.kind !== 0) return;
      const qs = edgeQuads.get(n);
      if (qs && qs.some((i) => drawn[i])) return;
      g.moveTo(X[k.a], Y[k.a]); g.lineTo(X[k.b], Y[k.b]);
    });
    g.stroke();
    // the rings
    g.fillStyle = '#c99b45'; g.strokeStyle = '#7a5a22'; g.lineWidth = 1.2;
    for (let i = 0; i < sim.n; i++) if (sim.ring[i]) { g.beginPath(); g.arc(X[i], Y[i] - 6, 5, 0, Math.PI * 2); g.fill(); g.stroke(); }
    // the blade's trail
    g.lineCap = 'round';
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1], b = trail[i], life = clamp(1 - (clock - b.t) / 0.25, 0, 1);
      if (life <= 0) continue;
      g.strokeStyle = `rgba(255, 255, 255, ${life * 0.9})`; g.lineWidth = 1.5 + 4 * life;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
  }
  function tick(dt) {
    clock += dt;
    while (trail.length && clock - trail[0].t > 0.3) trail.shift();
  }

  // ---------- input ----------
  function down(p) {
    last = { x: p.x, y: p.y };
    if (tool === 'grab') sim.grab(p.x, p.y, 34);
    else trail.push({ x: p.x, y: p.y, t: clock });
  }
  function move(p, e, held) {
    if (!held || !last) return;
    if (tool === 'grab') sim.drag(p.x, p.y);
    else { sim.slash(last.x, last.y, p.x, p.y); trail.push({ x: p.x, y: p.y, t: clock }); }
    last = { x: p.x, y: p.y };
  }
  function up() { sim.release(); last = null; }
  function event(name, d) {
    if ((name === 'tear' || name === 'cut') && clock - lastRip > 0.08) {
      lastRip = clock;
      audio.noise({ dur: name === 'tear' ? 0.18 : 0.07, vol: name === 'tear' ? 0.07 : 0.05, filter: 'bandpass', freq: name === 'tear' ? 1400 : 3200, q: 0.7 });
    } else if (name === 'gust') audio.noise({ dur: 1.2, vol: 0.05, filter: 'lowpass', freq: 500, to: 200 });
    else if (name === 'hang') { edgeQuads = null; audio.tone({ freq: 880, to: 1320, dur: 0.1, type: 'triangle', vol: 0.04 }); }
  }

  // ---------- controls ----------
  const grabBtn = document.getElementById('ct-grab'), cutBtn = document.getElementById('ct-cut');
  function setTool(t) { tool = t; grabBtn.setAttribute('aria-pressed', String(t === 'grab')); cutBtn.setAttribute('aria-pressed', String(t === 'cut')); }
  grabBtn.addEventListener('click', () => setTool('grab'));
  cutBtn.addEventListener('click', () => setTool('cut'));
  const wind = document.getElementById('ct-wind');
  wind.value = sim.wind;
  wind.addEventListener('input', () => { sim.setWind(wind.value); save(); });
  document.getElementById('ct-gust').addEventListener('click', () => sim.puff(1.4));
  document.getElementById('ct-hang').addEventListener('click', () => sim.hang());
  function key(e, isDown) {
    if (!isDown) return false;
    if (e.key === 'g') { setTool('grab'); return true; }
    if (e.key === 'c') { setTool('cut'); return true; }
    if (e.key === 'w') { sim.puff(1.4); return true; }
    return false;
  }
  function show() { wind.value = sim.wind; setTool(tool); }

  return { draw, tick, down, move, up, event, key, resize, show, setTool };
}
function norm(v) { const l = Math.hypot(...v); return v.map((x) => x / l); }
