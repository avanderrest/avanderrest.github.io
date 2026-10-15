/* Physics Playground: soap bubbles. The film's colours are thin-film interference: a sheet
   of swirled thickness (a few hundred nanometres) is turned into the colour that light of
   650, 510 and 475nm makes reflecting off both faces of a film that thick, once, into a
   texture; each bubble shows a turning piece of it, faint in the middle and strong at the
   rim, where you see the film edge on. Bubbles stuck in foam are cut off at the plane
   they share with each neighbour (the radical line of the two circles), and that wall is
   drawn. The wand follows the finger; holding on the wand on its stand, the space bar, or
   blowing into the microphone blows bubbles there. See sim.js for the bubbles. */

// ---------- constants ----------
const TEX = 256;
const N_FILM = 1.33;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function createBubblesView({ sim, canvas, g, fit, audio, save, W, H }) {
  let bg = null, film = null, clock = 0, blowing = 0, waving = false, spray = [];
  let mic = null;

  // ---------- the film texture ----------
  function makeFilm() {
    film = document.createElement('canvas');
    film.width = film.height = TEX;
    const f = film.getContext('2d'), im = f.createImageData(TEX, TEX), D = im.data;
    for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) {
      const u = x / TEX * 2 - 1, v = y / TEX * 2 - 1;
      // swirled thickness, thinner towards the top as the film drains
      const a = Math.atan2(v, u), r = Math.hypot(u, v);
      const sw = Math.sin(a * 3 + r * 7) * 0.5 + Math.sin(u * 5.3 - v * 3.1 + Math.sin(v * 4) * 1.5) * 0.35 + Math.sin(r * 11 - a * 2) * 0.15;
      const nm = 420 + 330 * sw + 260 * v;
      const o = (y * TEX + x) * 4;
      D[o] = 255 * interfere(nm, 650); D[o + 1] = 255 * interfere(nm, 510); D[o + 2] = 255 * interfere(nm, 475); D[o + 3] = 255;
    }
    f.putImageData(im, 0, 0);
  }
  // the reflected share of light of wavelength l off a film d thick (half a wave lost at the front face)
  function interfere(d, l) { const s = Math.sin(2 * Math.PI * N_FILM * d / l + Math.PI / 2); return clamp(s * s * 1.05, 0, 1); }

  function paintBackground() {
    bg = document.createElement('canvas');
    bg.width = canvas.width; bg.height = canvas.height;
    const b = bg.getContext('2d'), { s, ox, oy } = fit;
    const sky = b.createLinearGradient(0, 0, 0, bg.height);
    sky.addColorStop(0, '#7fb4dc'); sky.addColorStop(0.6, '#cfe4ee'); sky.addColorStop(1, '#e8efe0');
    b.fillStyle = sky; b.fillRect(0, 0, bg.width, bg.height);
    // a garden out of focus behind
    let seed = 8;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    b.filter = `blur(${Math.round(14 * s)}px)`;
    for (let i = 0; i < 46; i++) {
      const x = r() * bg.width, y = oy + (360 + r() * 260) * s, rr = (50 + r() * 120) * s;
      b.fillStyle = `hsla(${95 + r() * 50}, ${30 + r() * 25}%, ${30 + r() * 22}%, 0.85)`;
      b.beginPath(); b.arc(x, y, rr, 0, Math.PI * 2); b.fill();
    }
    for (let i = 0; i < 26; i++) {
      b.fillStyle = `hsla(${[340, 45, 280, 15][i % 4]}, 70%, ${65 + r() * 15}%, 0.7)`;
      b.beginPath(); b.arc(r() * bg.width, oy + (470 + r() * 180) * s, (8 + r() * 16) * s, 0, Math.PI * 2); b.fill();
    }
    b.filter = 'none';
    // the table, wet
    const top = oy + sim.FLOOR * s;
    const wood = b.createLinearGradient(0, top, 0, bg.height);
    wood.addColorStop(0, '#9b7653'); wood.addColorStop(1, '#5e4329');
    b.fillStyle = wood; b.fillRect(0, top, bg.width, bg.height - top);
    b.fillStyle = 'rgba(255,255,255,0.25)'; b.fillRect(0, top, bg.width, 2 * s);
    // the soap dish and the wand on its stand
    const st = sim.STAND;
    b.fillStyle = '#d9e6ee'; b.beginPath(); b.ellipse(ox + st.x * s, top - 6 * s, 70 * s, 16 * s, 0, 0, Math.PI * 2); b.fill();
    b.fillStyle = 'rgba(160, 200, 230, 0.7)'; b.beginPath(); b.ellipse(ox + st.x * s, top - 10 * s, 58 * s, 10 * s, 0, 0, Math.PI * 2); b.fill();
    b.strokeStyle = '#e35d8f'; b.lineWidth = 7 * s; b.lineCap = 'round';
    b.beginPath(); b.moveTo(ox + (st.x - 38) * s, top - 8 * s); b.lineTo(ox + (st.x - 12) * s, oy + (st.y + 22) * s); b.stroke();
    b.lineWidth = 6 * s;
    b.beginPath(); b.arc(ox + st.x * s, oy + st.y * s, 24 * s, 0, Math.PI * 2); b.stroke();
  }
  function resize() { paintBackground(); }

  // a bubble: clipped to its own side of every wall it shares, film then rim
  function bubble(b, others, alpha = 1) {
    const s = fit.s;
    g.save();
    g.beginPath(); g.arc(b.x, b.y, b.r, 0, Math.PI * 2); g.clip();
    if (b.landed) { g.beginPath(); g.rect(b.x - b.r - 2, b.y - b.r - 2, b.r * 2 + 4, b.r + 2); g.clip(); }
    for (const c of others) {
      // the radical line: where the two circles have equal power
      const dx = c.x - b.x, dy = c.y - b.y, d = Math.hypot(dx, dy) || 1;
      const a = (d * d + b.r * b.r - c.r * c.r) / (2 * d), ux = dx / d, uy = dy / d;
      const mx = b.x + ux * a, my = b.y + uy * a, big = (b.r + 10) * 3;
      g.beginPath();
      g.moveTo(mx - uy * big, my + ux * big); g.lineTo(mx + uy * big, my - ux * big);
      g.lineTo(mx + uy * big - ux * big, my - ux * big - uy * big); g.lineTo(mx - uy * big - ux * big, my + ux * big - uy * big);
      g.closePath(); g.clip();
    }
    g.globalAlpha = 0.55 * alpha;
    g.globalCompositeOperation = 'screen';
    g.translate(b.x, b.y); g.rotate(b.swirl + clock * 0.25 + b.id);
    g.drawImage(film, -b.r * 1.1, -b.r * 1.1, b.r * 2.2, b.r * 2.2);
    g.setTransform(s, 0, 0, s, fit.ox, fit.oy);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = alpha;
    const rim = g.createRadialGradient(b.x, b.y, b.r * 0.55, b.x, b.y, b.r);
    rim.addColorStop(0, 'rgba(255,255,255,0)'); rim.addColorStop(0.85, 'rgba(255,255,255,0.10)'); rim.addColorStop(1, 'rgba(255,255,255,0.45)');
    g.fillStyle = rim; g.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = Math.max(0.8, b.r * 0.02);
    g.beginPath(); g.arc(b.x, b.y, b.r - 0.5, 0, Math.PI * 2); g.stroke();
    // the window and the sky, caught on the front
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.beginPath(); g.ellipse(b.x - b.r * 0.42, b.y - b.r * 0.45, b.r * 0.16, b.r * 0.09, -0.7, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.3)';
    g.beginPath(); g.ellipse(b.x + b.r * 0.45, b.y + b.r * 0.42, b.r * 0.08, b.r * 0.05, -0.7, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  function draw() {
    if (!bg) paintBackground();
    if (!film) makeFilm();
    const { s, ox, oy } = fit;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(bg, 0, 0);
    g.setTransform(s, 0, 0, s, ox, oy);
    const bs = sim.bubbles;
    const near = new Map(bs.map((b) => [b, sim.touching(b)]));
    for (const b of bs) bubble(b, near.get(b));
    // the shared walls
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1.1;
    for (const b of bs) for (const c of near.get(b)) {
      if (c.id < b.id) continue;
      const dx = c.x - b.x, dy = c.y - b.y, d = Math.hypot(dx, dy) || 1;
      const a = (d * d + b.r * b.r - c.r * c.r) / (2 * d), hh = Math.sqrt(Math.max(0, b.r * b.r - a * a));
      const ux = dx / d, uy = dy / d, mx = b.x + ux * a, my = b.y + uy * a;
      g.beginPath(); g.moveTo(mx - uy * hh, my + ux * hh); g.lineTo(mx + uy * hh, my - ux * hh); g.stroke();
    }
    // the film still in the wand
    const f = sim.film;
    if (f && f.r > 2) bubble({ x: f.x, y: f.y, r: f.r, id: 0, swirl: 0, landed: false }, [], 0.9);
    if (sim.wand.down) {
      g.strokeStyle = '#e35d8f'; g.lineWidth = 6; g.lineCap = 'round';
      g.beginPath(); g.arc(sim.wand.x, sim.wand.y, 22, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(sim.wand.x + 16, sim.wand.y + 16); g.lineTo(sim.wand.x + 70, sim.wand.y + 90); g.stroke();
    }
    // spray from pops
    for (const p of spray) {
      const life = 1 - p.age / p.ttl;
      g.fillStyle = `rgba(230, 245, 255, ${life * 0.8})`;
      g.beginPath(); g.arc(p.x, p.y, 1.6, 0, Math.PI * 2); g.fill();
    }
    // the breath meter, when the mic is on
    if (mic) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      const x = ox + (sim.STAND.x - 50) * s, y = oy + (sim.FLOOR + 14) * s, w = 100 * s;
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x, y, w, 6 * s);
      g.fillStyle = '#e35d8f'; g.fillRect(x, y, w * clamp(mic.level, 0, 1), 6 * s);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
  }
  function tick(dt) {
    clock += dt;
    // breath: the mic, holding the stand, or the space bar
    const level = Math.max(blowing, mic ? micLevel() : 0);
    sim.blow(level);
    for (const p of spray) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt; }
    spray = spray.filter((p) => p.age < p.ttl);
  }

  // ---------- the microphone ----------
  // Blowing is broadband noise, which the browser's noise suppression is built to remove,
  // so all its voice processing is off here (Pocket Pal wants it on; this wants the hiss).
  async function startMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      const src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser();
      an.fftSize = 1024;
      // a breath is mostly low rumble on the capsule: keep the highs out of the meter
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      src.connect(lp); lp.connect(an);
      mic = { stream, ctx, an, buf: new Float32Array(an.fftSize), level: 0, floor: 0.01 };
      return true;
    } catch (e) { mic = null; return false; }
  }
  function stopMic() {
    if (!mic) return;
    for (const t of mic.stream.getTracks()) t.stop();
    mic.ctx.close();
    mic = null;
  }
  function micLevel() {
    mic.an.getFloatTimeDomainData(mic.buf);
    let sum = 0;
    for (const v of mic.buf) sum += v * v;
    const rms = Math.sqrt(sum / mic.buf.length);
    if (rms < mic.floor * 2) mic.floor = mic.floor * 0.97 + rms * 0.03;
    const lv = clamp((rms - mic.floor * 2.5) / 0.12, 0, 1);
    mic.level += (lv - mic.level) * 0.4;
    return mic.level;
  }

  // ---------- input ----------
  let downAt = null;
  function down(p) {
    downAt = { x: p.x, y: p.y, t: clock };
    // on the wand on its stand: hold to blow
    if (Math.hypot(p.x - sim.STAND.x, p.y - sim.STAND.y) < 50) { blowing = 0.65; return; }
    waving = true;
    sim.wandDown(p.x, p.y);
  }
  function move(p, e, held) { if (held && waving) sim.wandTo(p.x, p.y); }
  function up(p) {
    blowing = 0;
    if (waving) {
      waving = false;
      // a tap, not a wave: pop whatever it was on
      const tap = downAt && Math.hypot(p.x - downAt.x, p.y - downAt.y) < 8 && clock - downAt.t < 0.35;
      if (tap) { sim.film = null; sim.wand.down = false; sim.popAt(p.x, p.y); } else sim.wandUp();
    }
    downAt = null;
  }
  function event(name, d) {
    if (name === 'pop') {
      audio.noise({ dur: 0.04, vol: 0.06 + Math.min(0.06, d.r / 1500), filter: 'highpass', freq: 2500 + 2000 * Math.random() });
      const n = Math.round(10 + d.r / 3);
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 140;
        spray.push({ x: d.x + Math.cos(a) * d.r, y: d.y + Math.sin(a) * d.r, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, age: 0, ttl: 0.3 + Math.random() * 0.3 });
      }
    } else if (name === 'made' && Math.random() < 0.5) {
      audio.tone({ freq: 700 + Math.random() * 500, dur: 0.05, type: 'sine', vol: 0.015 });
    }
  }
  function key(e, isDown) {
    if (e.key === ' ') { blowing = isDown ? 0.7 : 0; return true; }
    if (isDown && e.key === 'p') { sim.popAll(); return true; }
    return false;
  }

  // ---------- controls ----------
  const wind = document.getElementById('bb-wind');
  wind.value = sim.wind;
  wind.addEventListener('input', () => { sim.setWind(wind.value); save(); });
  const micBtn = document.getElementById('bb-mic');
  const hasMic = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  if (!hasMic) micBtn.hidden = true;
  micBtn.addEventListener('click', async () => {
    if (mic) { stopMic(); micBtn.setAttribute('aria-pressed', 'false'); micBtn.textContent = '🎤 Blow into the mic'; return; }
    micBtn.textContent = '🎤 Asking…';
    const ok = await startMic();
    micBtn.setAttribute('aria-pressed', String(ok));
    micBtn.textContent = ok ? '🎤 Listening: blow!' : '🎤 No microphone';
  });
  document.getElementById('bb-pop').addEventListener('click', () => sim.popAll());
  function show() { wind.value = sim.wind; }
  // leaving the tab lets go of the microphone
  function hide() { if (mic) { stopMic(); micBtn.setAttribute('aria-pressed', 'false'); micBtn.textContent = '🎤 Blow into the mic'; } blowing = 0; }

  return { draw, tick, down, move, up, event, key, resize, show, hide };
}
