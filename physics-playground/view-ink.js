/* Physics Playground: the marbling tray. Every ink outline from the sim is filled in the
   order it was dropped (a later drop always lies inside the rings it pushed out, so the
   painter's order is the right one), with a faint darker rim where the ink meets the
   water, on a tray of pale size. Drop holds and spreads; the stylus and the comb drag the
   water. With a pen, pressing harder makes a wider stylus. See sim.js for the water. */
import { INK_COLOURS } from './sim.js';

// ---------- constants ----------
const WATER = '#efe6d0';
const RIM = 'rgba(40, 24, 12, 0.22)';
const SWEEPS = ['down', 'right', 'up', 'left'];

export function createInkView({ sim, canvas, g, fit, audio, save, W, H }) {
  let tool = 'drop', last = null, bg = null, grain = null, sweepNo = 0, lastSwish = 0, clock = 0;

  function paintBackground() {
    bg = document.createElement('canvas');
    bg.width = canvas.width; bg.height = canvas.height;
    const b = bg.getContext('2d');
    // the workshop table round the tray
    b.fillStyle = '#3a2618'; b.fillRect(0, 0, bg.width, bg.height);
    const { s, ox, oy } = fit;
    // the tray's wooden rim
    b.fillStyle = '#7a4f2e';
    const m = 16 * s;
    b.fillRect(ox - m, oy - m, W * s + m * 2, H * s + m * 2);
    b.strokeStyle = 'rgba(0, 0, 0, 0.35)'; b.lineWidth = 2;
    b.strokeRect(ox - 1, oy - 1, W * s + 2, H * s + 2);
    // grain on the water: the size is never quite even
    grain = document.createElement('canvas');
    grain.width = 256; grain.height = 256;
    const q = grain.getContext('2d');
    let seed = 17;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2600; i++) {
      q.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '90,60,30'}, ${0.03 + r() * 0.06})`;
      q.beginPath(); q.arc(r() * 256, r() * 256, 0.6 + r() * 2.2, 0, Math.PI * 2); q.fill();
    }
  }
  function resize() { paintBackground(); }

  function draw() {
    if (!bg) paintBackground();
    const { s, ox, oy } = fit;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(bg, 0, 0);
    g.save();
    g.beginPath(); g.rect(ox, oy, W * s, H * s); g.clip();
    g.fillStyle = WATER; g.fillRect(ox, oy, W * s, H * s);
    g.setTransform(s, 0, 0, s, ox, oy);
    g.lineJoin = 'round';
    g.lineWidth = 0.9;
    g.strokeStyle = RIM;
    for (const ink of sim.inks) {
      const P = ink.pts;
      if (P.length < 6) continue;
      g.beginPath();
      g.moveTo(P[0], P[1]);
      for (let k = 2; k < P.length; k += 2) g.lineTo(P[k], P[k + 1]);
      g.closePath();
      const c = INK_COLOURS[ink.c].rgb;
      g.fillStyle = `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
      g.fill();
      g.stroke();
    }
    // the grain of the size over everything, ink included
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 0.7;
    const pat = g.createPattern(grain, 'repeat');
    g.fillStyle = pat; g.fillRect(ox, oy, W * s, H * s);
    g.globalAlpha = 1;
    // a soft light across the tray
    const sh = g.createLinearGradient(ox, oy, ox + W * s, oy + H * s);
    sh.addColorStop(0, 'rgba(255, 250, 235, 0.10)'); sh.addColorStop(1, 'rgba(60, 30, 10, 0.10)');
    g.fillStyle = sh; g.fillRect(ox, oy, W * s, H * s);
    // the tool, where it is
    if (last && tool !== 'drop') {
      g.setTransform(s, 0, 0, s, ox, oy);
      g.fillStyle = 'rgba(40, 30, 20, 0.55)';
      const tips = tool === 'comb' ? combTips(last) : [[last.x, last.y]];
      for (const [x, y] of tips) { g.beginPath(); g.arc(x, y, 2.5, 0, Math.PI * 2); g.fill(); }
    }
    g.restore();
  }
  function combTips(p) {
    const dx = p.dx || 1, dy = p.dy || 0, out = [];
    for (let k = 0; k < 9; k++) { const o = (k - 4) * 46; out.push([p.x - dy * o, p.y + dx * o]); }
    return out;
  }
  function tick(dt) { clock += dt; }

  // ---------- input ----------
  function down(p, e) {
    if (tool === 'drop') {
      sim.drop(p.x, p.y, 16, sim.colour);
      return;
    }
    last = { x: p.x, y: p.y, dx: 1, dy: 0 };
  }
  function move(p, e, held) {
    if (!held || !last || tool === 'drop') return;
    const dx = p.x - last.x, dy = p.y - last.y, d = Math.hypot(dx, dy);
    if (d < 0.5) return;
    // a pen pressed harder is a wider stylus
    const r = e && e.pointerType === 'pen' && e.pressure > 0 ? 6 + 14 * e.pressure : 11;
    if (tool === 'stylus') sim.stylus(last.x, last.y, p.x, p.y, r);
    else sim.comb(last.x, last.y, p.x, p.y, 9, 46, r * 0.8);
    last = { x: p.x, y: p.y, dx: dx / d, dy: dy / d };
    if (clock - lastSwish > 0.12 && d > 4) {
      lastSwish = clock;
      audio.noise({ dur: 0.14, vol: 0.02 + Math.min(0.03, d / 800), filter: 'bandpass', freq: 700 + d * 8, q: 0.8 });
    }
  }
  function up() { sim.release(); last = null; }
  function event(name, d) {
    if (name === 'drop' && d.r < 20) {
      audio.tone({ freq: 900 + Math.random() * 300, to: 420, dur: 0.09, type: 'sine', vol: 0.05 });
    } else if (name === 'sweep') audio.noise({ dur: 1.4, vol: 0.03, filter: 'bandpass', freq: 600, to: 1100, q: 0.6 });
  }

  // ---------- controls ----------
  const colourBox = document.getElementById('ik-colours');
  INK_COLOURS.forEach((c, i) => {
    const b = document.createElement('button');
    b.style.background = `rgb(${c.rgb.join(',')})`; b.title = c.name; b.setAttribute('aria-label', c.name + ' ink');
    b.addEventListener('click', () => { sim.colour = i; syncColours(); setTool('drop'); save(); });
    colourBox.appendChild(b);
  });
  function syncColours() { [...colourBox.children].forEach((b, i) => b.setAttribute('aria-pressed', String(i === sim.colour))); }
  const toolBtns = { drop: document.getElementById('ik-drop'), stylus: document.getElementById('ik-stylus'), comb: document.getElementById('ik-comb') };
  function setTool(t) { tool = t; for (const [k, b] of Object.entries(toolBtns)) b.setAttribute('aria-pressed', String(k === t)); }
  for (const [k, b] of Object.entries(toolBtns)) b.addEventListener('click', () => setTool(k));
  document.getElementById('ik-sweep').addEventListener('click', () => sim.sweep(SWEEPS[sweepNo++ % SWEEPS.length]));
  document.getElementById('ik-stone').addEventListener('click', () => sim.sprinkle(40));
  document.getElementById('ik-clear').addEventListener('click', () => sim.clear());
  function key(e, isDown) {
    if (!isDown) return false;
    const k = { d: 'drop', s: 'stylus', c: 'comb' }[e.key];
    if (k) { setTool(k); return true; }
    return false;
  }
  function show() { syncColours(); setTool(tool); }
  syncColours();

  return { draw, tick, down, move, up, event, resize, show, key, setTool, get tool() { return tool; } };
}
