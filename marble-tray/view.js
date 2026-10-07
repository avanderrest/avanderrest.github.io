/* Marble Tray: the screen. The walnut case and baize painted from Amber's plates, the
   marbles, holes, rails and the bowls' house, the synthesised clicks and knocks, the
   panels, and the keys and pointer. See sim.js for the physics and the three games. */
import { createTray } from './sim.js';
import { expose } from '../lib/debug.js';

  // ---------- saved ----------
  // Which game was on the tray last, how far through the mazes you have got and your best time
  // on each. v1 and v2 were the sandbox's kept trays; there is no sandbox to load them into now.
  const SAVE_KEY = 'marble-tray-save-v3';
  const store = { mode: 'match', maze: { level: 0, reached: 0, best: {} } };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      Object.assign(store, { ...store, ...s, maze: { ...store.maze, ...(s.maze || {}) } });
    }
  } catch (_) { /* fresh start */ }

  const mt = createTray({ store, on: onEvent });
  const { tick,
    seeded, makeBody, makeWall, updateVerts, carveMaze, exits, routeFrom, awkwardTurns, buildMaze, circleCircle, circlePoly, axisLeast, clip, polyPoly, collide, nearWall, relVel, solve, correct, steerCap, dirOf, keyDir, step, lip, sink, add, overlapsAny, removeBody, clearAll, paidBy, inPlay, freeSpot, placeIn, startMatch, matchIdle, shoveInward, rescueStuck, halfFor, placeShooter, aiPlace, score, endMatch, planShots, aiThink, clock, startMaze, mazeHome, mazeTick, unwedge, wedged, mazeSunk, startBowls, startEnd, matSpot, nextBowl, humanTurn, flickFrom, throwBowl, bowlsTick, standing, scoreEnd, afterEnd, endBowls, simulate, endValue, planBowl, aiBowl, setControl, setControl2, selectMode, W, H, RIM, SUBSTEPS, ITERATIONS, SLOP, PERCENT, REST_THRESH, SOUND_MIN, THRUST, STEER_MAX, STEER_MIN, STEER_RAMP, STEER_BRAKE, LEAN_K, LEAN_D, HOLE_R, HOLE_PULL, SINK_SPEED, SINK_TIME, TEAM_MARBLES, COUNTDOWN, MODES, MAZES, MAZE_WALL, GOAL_R, TRAP_R, LIP_W, LIP_ACCEL, WEDGE_WAIT, WEDGE_POP, BOWL, BOWLS_EACH, BOWLS_TO, MAT_X, DEAD_X, FLICK_MAX, PULL_FULL, HOUSE, HOUSE_RINGS, END_PAUSE, pick, clamp, MARBLE_COLOURS, KINDS, bodies, walls, holes, sinking, fixtures, maze, cellX, cellY, keysA, keysB, KEYMAP, windA, windB, soundQueue, lastPairSound, TEAM, AI_LEVELS, match, SHAKE_WAIT, SHAKE_GIVE_UP, bowls, other, sideName, rollOut,
  } = mt;

  function refreshUi() {
    if (mt.mode === 'match') updateMatchUI();
    else if (mt.mode === 'maze') renderMazeUI();
    else if (mt.mode === 'bowls') updateBowlsUI();
  }
  function showResult(res) {
    if (!res) { $('result').hidden = true; return; }
    $('result-title').textContent = res.title;
    $('result-line').textContent = res.line;
    if (res.again) $('btn-result-again').textContent = res.again;
    $('result').hidden = false;
  }
  function onEvent(ev, d) {
    switch (ev) {
      case 'sfx': sound[d[0]](...d.slice(1)); break;
      case 'ui': refreshUi(); break;
      case 'maze-time': if ($('maze-time').textContent !== d) $('maze-time').textContent = d; break;
      case 'result': showResult(d); break;
      case 'later': setTimeout(d.fn, d.ms); break;
      case 'jolt': jolt(d); break;
      case 'paint-case': paintCase(); break;
      case 'save': persist(); break;
    }
  }

  // ---------- touch screens ----------
  // `pointer: coarse` only describes the main pointer, so a Surface with its keyboard
  // attached would hide the on-screen controls. Any touch screen, or the first finger
  // or pen on the glass, sets <html class="has-touch"> instead, and a long press on a
  // button or the canvas no longer opens the browser's menu.
  (() => {
    const root = document.documentElement;
    let finger = false;
    if (window.matchMedia && matchMedia('(any-pointer: coarse)').matches) root.classList.add('has-touch');
    addEventListener('pointerdown', (e) => { finger = e.pointerType !== 'mouse'; if (finger) root.classList.add('has-touch'); }, true);
    addEventListener('contextmenu', (e) => { if (finger && e.target.closest && e.target.closest('button, canvas')) e.preventDefault(); }, true);
  })();

  // ---------- the page ----------
  const canvas = document.getElementById('tray');
  const ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);
  const rand = (a, b) => a + Math.random() * (b - a);   // for the jolt; the rules have their own dice

  // Painted into the case itself, under everything, since nothing about them ever changes.
  function paintRails(g) {
    if (!maze.on || !maze.segs.length) return;
    g.save();
    roundRect(g, RIM, RIM, W - 2 * RIM, H - 2 * RIM, WELL_R); g.clip();
    const boxes = (dx, dy, grow) => {
      g.beginPath();
      for (const s of maze.segs) g.rect(s.x0 - grow + dx, s.y0 - grow + dy, s.x1 - s.x0 + 2 * grow, s.y1 - s.y0 + 2 * grow);
      for (const f of maze.chamfers) {
        // grown from its own middle, which is near enough for an edge a pixel wide
        const v = f.wv.map(p => {
          const ex = p.x - f.x, ey = p.y - f.y, el = Math.hypot(ex, ey) || 1;
          return { x: p.x + ex / el * grow * Math.SQRT2 + dx, y: p.y + ey / el * grow * Math.SQRT2 + dy };
        });
        g.moveTo(v[0].x, v[0].y);
        for (let i = 1; i < 4; i++) g.lineTo(v[i].x, v[i].y);
        g.closePath();
      }
    };
    // One path for every rail, so where two meet they fill as a single piece of wood with no
    // seam drawn between them: shadow, then a dark edge, then the walnut on top.
    g.fillStyle = 'rgba(3, 20, 10, 0.34)'; boxes(3, 4, 1.5); g.fill();
    g.fillStyle = 'rgba(22, 11, 3, 0.9)'; boxes(0, 0, 1.2); g.fill();
    g.fillStyle = art.walnut ? tiled(g, art.walnut, 336, 200) : '#6b4524'; boxes(0, 0, 0); g.fill();
    for (const s of maze.segs) {                    // lit along the top, shaded along the bottom
      g.fillStyle = 'rgba(255, 226, 176, 0.2)';
      g.fillRect(s.x0 + 1, s.y0 + 1, s.x1 - s.x0 - 2, 2);
      g.fillStyle = 'rgba(10, 5, 1, 0.3)';
      g.fillRect(s.x0 + 1, s.y1 - 2.5, s.x1 - s.x0 - 2, 1.5);
    }
    const rg = seeded(maze.level + 3);
    for (const p of maze.posts) brassScrew(g, p.x, p.y, 4.2, rg() * 3);
    g.restore();
  }


  // ---------- sound ----------
  const sound = {
    on: false, ac: null, master: null, noise: null, recent: [],
    ensure() {
      if (this.ac) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ac = new AC();
      this.master = this.ac.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(this.ac.destination);
      const len = Math.floor(this.ac.sampleRate * 0.12);
      this.noise = this.ac.createBuffer(1, len, this.ac.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    },
    tone(type, freq, gain, decay, t) {
      const o = this.ac.createOscillator(), g = this.ac.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0005, t + decay);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + decay + 0.02);
    },
    burst(freq, q, gain, decay, t) {
      const s = this.ac.createBufferSource(), f = this.ac.createBiquadFilter(), g = this.ac.createGain();
      s.buffer = this.noise;
      f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0005, t + decay);
      s.connect(f); f.connect(g); g.connect(this.master);
      s.start(t); s.stop(t + decay + 0.02);
    },
    tap() {                                              // a shooter being set down on the tray
      if (!this.on || !this.ac) return;
      const t = this.ac.currentTime;
      this.burst(1500, 4, 0.05, 0.05, t);
      this.tone('sine', 300, 0.05, 0.09, t);
    },
    beat(n) {                                            // n counts 3, 2, 1 then 0 for the off
      if (!this.on || !this.ac || n < 0) return;
      const t = this.ac.currentTime;
      if (n === 0) {
        this.tone('sine', 660, 0.2, 0.2, t);
        this.tone('sine', 990, 0.11, 0.34, t + 0.07);
      } else {
        this.tone('sine', 440, 0.15, 0.13, t);
        this.tone('sine', 880, 0.05, 0.09, t);
      }
    },
    hit(a, b, speed) {
      if (!this.on || !this.ac) return;
      const t = this.ac.currentTime;
      this.recent = this.recent.filter(x => t - x < 0.1);
      if (this.recent.length > 6) return;
      this.recent.push(t);
      const v = clamp((speed - SOUND_MIN) / 700, 0.04, 1);
      const mats = [a.material, b.material].sort().join('+');
      const size = (a.bound + b.bound) / 2;
      if (mats === 'glass+glass') {
        const f = clamp(3200 - size * 45, 1400, 3000);
        this.tone('sine', f, v * 0.35, 0.09, t);
        this.tone('sine', f * 2.4, v * 0.12, 0.05, t);
        this.burst(f, 8, v * 0.25, 0.03, t);
      } else if (mats.includes('cork')) {
        this.tone('sine', 220 - size, v * 0.25, 0.07, t);
        this.burst(600, 2, v * 0.1, 0.03, t);
      } else if (mats.includes('glass')) {
        this.tone('triangle', clamp(900 - size * 8, 380, 900), v * 0.3, 0.06, t);
        this.burst(1200, 4, v * 0.18, 0.03, t);
      } else if (mats === 'metal+metal') {
        const f = clamp(2600 - size * 30, 900, 2400);
        this.tone('sine', f, v * 0.3, 0.55, t);            // the ring is the whole character
        this.tone('sine', f * 1.51, v * 0.16, 0.34, t);    // an inharmonic partner keeps it bell-like
        this.tone('triangle', f * 0.5, v * 0.1, 0.18, t);
        this.burst(f * 1.4, 10, v * 0.22, 0.02, t);
      } else if (mats.includes('metal')) {
        this.tone('triangle', clamp(1500 - size * 14, 500, 1400), v * 0.22, 0.12, t);
        this.burst(900, 5, v * 0.3, 0.04, t);
      } else if (mats.includes('rubber')) {
        this.tone('sine', clamp(260 - size * 2, 120, 260), v * 0.3, 0.1, t);
        this.burst(420, 2.5, v * 0.16, 0.04, t);
      } else if (mats === 'stone+stone') {
        this.burst(1100, 6, v * 0.35, 0.05, t);
        this.tone('sine', 700, v * 0.12, 0.05, t);
      } else {
        this.burst(clamp(520 - size * 3, 260, 520), 3, v * 0.4, 0.05, t);
        this.tone('triangle', 330, v * 0.08, 0.04, t);
      }
    },
  };

  // ---------- drawing ----------
  let dpr = 1;
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    paintCase();
  }
  window.addEventListener('resize', resize);

  // ---------- the case ----------
  // Walnut, green baize and brass, cut out of Amber's painted plates (see
  // assets/ and ASSETS.md). It is painted once into an offscreen canvas and
  // again whenever the pixel ratio changes, so the felt is sharp on a retina
  // screen without costing anything per frame. If a texture fails to load the
  // same routine paints flat colour in its place, so the tray is never bare.
  const RIM_R = 16;                 // outer corner radius of the case
  const WELL_R = 9;                 // inner corner radius of the baize well
  const FELT_PX = 330;              // px the 256px felt tile is laid down at
  const ART_SRC = {
    walnut: 'assets/walnut.jpg', post: 'assets/walnut-post.jpg', felt: 'assets/felt.jpg',
    ringYou: 'assets/ring-blue.png', ringThem: 'assets/ring-pink.png',
  };
  const art = {};
  const bg = document.createElement('canvas');

  // A pattern laid down at a chosen size. Scaling through an offscreen tile
  // rather than a pattern transform keeps it crisp and needs no DOMMatrix.
  function tiled(g, img, w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return g.createPattern(c, 'repeat');
  }

  function brassScrew(g, x, y, r, slot) {
    const gr = g.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.08, x, y, r);
    gr.addColorStop(0, '#fbeab4'); gr.addColorStop(0.45, '#cfa956'); gr.addColorStop(1, '#7a5a1e');
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(28, 16, 4, 0.6)'; g.lineWidth = 1;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
    g.save();
    g.translate(x, y); g.rotate(slot);
    g.strokeStyle = 'rgba(48, 30, 8, 0.7)'; g.lineWidth = Math.max(1, r * 0.28);
    g.beginPath(); g.moveTo(-r * 0.58, 0); g.lineTo(r * 0.58, 0); g.stroke();
    g.strokeStyle = 'rgba(255, 238, 196, 0.35)'; g.lineWidth = Math.max(0.7, r * 0.14);
    g.beginPath(); g.moveTo(-r * 0.58, -r * 0.2); g.lineTo(r * 0.58, -r * 0.2); g.stroke();
    g.restore();
  }

  function paintCase() {
    bg.width = Math.round(W * dpr); bg.height = Math.round(H * dpr);
    const g = bg.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    // the box, grain running the long way
    g.save();
    roundRect(g, 0, 0, W, H, RIM_R); g.clip();
    g.fillStyle = art.walnut ? tiled(g, art.walnut, 336, 200) : '#5c3a1c';
    g.fillRect(0, 0, W, H);

    // the two uprights are cut from a post, so their grain runs across the rails'
    const stile = art.post ? tiled(g, art.post, 26, 1040) : null;
    if (stile) {
      g.fillStyle = stile;
      for (const s of [-1, 1]) {
        const o = s < 0 ? 0 : W, i = s < 0 ? RIM : W - RIM;
        g.beginPath(); g.moveTo(o, 0); g.lineTo(i, RIM); g.lineTo(i, H - RIM); g.lineTo(o, H);
        g.closePath(); g.fill();
      }
    }

    // each rail takes the light differently — that is what makes it read as a frame
    const rails = [
      [[0, 0], [W, 0], [W - RIM, RIM], [RIM, RIM], 'rgba(255, 226, 176, 0.17)'],
      [[0, H], [W, H], [W - RIM, H - RIM], [RIM, H - RIM], 'rgba(18, 9, 3, 0.36)'],
      [[0, 0], [RIM, RIM], [RIM, H - RIM], [0, H], 'rgba(255, 226, 176, 0.06)'],
      [[W, 0], [W - RIM, RIM], [W - RIM, H - RIM], [W, H], 'rgba(18, 9, 3, 0.22)'],
    ];
    for (const r of rails) {
      g.fillStyle = r[4];
      g.beginPath();
      g.moveTo(r[0][0], r[0][1]);
      for (let i = 1; i < 4; i++) g.lineTo(r[i][0], r[i][1]);
      g.closePath(); g.fill();
    }
    g.strokeStyle = 'rgba(30, 16, 5, 0.3)'; g.lineWidth = 1;   // the mitres
    for (const [ox, oy, ix, iy] of [[0, 0, RIM, RIM], [W, 0, W - RIM, RIM],
      [0, H, RIM, H - RIM], [W, H, W - RIM, H - RIM]]) {
      g.beginPath(); g.moveTo(ox, oy); g.lineTo(ix, iy); g.stroke();
    }
    g.restore();

    // the baize well
    const iw = W - 2 * RIM, ih = H - 2 * RIM;
    g.save();
    roundRect(g, RIM, RIM, iw, ih, WELL_R); g.clip();
    g.fillStyle = art.felt ? tiled(g, art.felt, FELT_PX, FELT_PX) : '#1f6b3c';
    g.fillRect(RIM, RIM, iw, ih);
    if (!art.felt) {                                  // a weave, if there is no cloth
      const rg = seeded(11);
      for (let i = 0; i < 7000; i++) {
        g.fillStyle = rg() < 0.5 ? 'rgba(6, 40, 20, 0.16)' : 'rgba(150, 220, 175, 0.1)';
        g.fillRect(RIM + rg() * iw, RIM + rg() * ih, 1.4, 1.4);
      }
    }
    // the cloth sinks a little towards the walls, and the middle of the tray is lit
    const vig = g.createRadialGradient(W * 0.46, H * 0.4, 40, W * 0.5, H * 0.5, W * 0.62);
    vig.addColorStop(0, 'rgba(255, 250, 225, 0.10)');
    vig.addColorStop(0.55, 'rgba(255, 250, 225, 0)');
    vig.addColorStop(1, 'rgba(4, 22, 12, 0.34)');
    g.fillStyle = vig;
    g.fillRect(RIM, RIM, iw, ih);
    const sink = 30;
    const walls = [[RIM, RIM, RIM, RIM + sink], [RIM, H - RIM, RIM, H - RIM - sink],
    [RIM, RIM, RIM + sink, RIM], [W - RIM, RIM, W - RIM - sink, RIM]];
    for (const [x0, y0, x1, y1] of walls) {
      const lg = g.createLinearGradient(x0, y0, x1, y1);
      lg.addColorStop(0, 'rgba(3, 20, 10, 0.5)'); lg.addColorStop(1, 'rgba(3, 20, 10, 0)');
      g.fillStyle = lg;
      g.fillRect(RIM, RIM, iw, ih);
    }
    g.restore();

    // where the cloth meets the wood: a dark seam, then the lit lip of the rebate
    g.strokeStyle = 'rgba(12, 6, 2, 0.6)'; g.lineWidth = 2;
    roundRect(g, RIM, RIM, iw, ih, WELL_R); g.stroke();
    g.strokeStyle = 'rgba(255, 228, 180, 0.22)'; g.lineWidth = 1.3;
    roundRect(g, RIM - 1.6, RIM - 1.6, iw + 3.2, ih + 3.2, WELL_R + 1.6); g.stroke();
    g.strokeStyle = 'rgba(20, 10, 3, 0.55)'; g.lineWidth = 1.5;
    roundRect(g, 0.75, 0.75, W - 1.5, H - 1.5, RIM_R); g.stroke();

    paintRails(g);

    const s = RIM / 2;
    brassScrew(g, s + 1, s + 1, 4.6, 0.5);
    brassScrew(g, W - s - 1, s + 1, 4.6, -0.7);
    brassScrew(g, s + 1, H - s - 1, 4.6, -0.3);
    brassScrew(g, W - s - 1, H - s - 1, 4.6, 0.9);
  }

  {
    let waiting = Object.keys(ART_SRC).length;
    const done = () => { if (--waiting === 0) paintCase(); };
    for (const [k, src] of Object.entries(ART_SRC)) {
      const img = new Image();
      img.onload = () => { art[k] = img; done(); };
      img.onerror = done;
      img.src = src;
    }
    resize();
  }

  function roundRect(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = clamp(((n >> 16) & 255) + amt, 0, 255), gg = clamp(((n >> 8) & 255) + amt, 0, 255), b = clamp((n & 255) + amt, 0, 255);
    return `rgb(${r},${gg},${b})`;
  }

  // Everything on the tray is round now, so a shadow is two soft discs down and to the right.
  function drawShadow(g, b) {
    g.save();
    g.translate(b.x + 3, b.y + 5);
    g.fillStyle = 'rgba(6, 22, 12, 0.44)';
    g.beginPath(); g.arc(0, 0, b.r * 1.02, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(6, 22, 12, 0.16)';
    g.beginPath(); g.arc(0, 1, b.r * 1.12, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  // Glass on green cloth. The body is lit from the top left and darkest just
  // inside the far edge; under that, a band where light has gone through the
  // marble, bounced off the baize and come back up. That bounce is what stops
  // a marble reading as a flat disc on a dark ground.
  function drawMarble(g, b) {
    const r = b.r, col = b.colour;
    const grad = g.createRadialGradient(-r * 0.34, -r * 0.4, r * 0.04, 0, 0, r * 1.02);
    grad.addColorStop(0, shade(col.base, 64));
    grad.addColorStop(0.36, col.base);
    grad.addColorStop(0.84, col.deep);
    grad.addColorStop(1, shade(col.deep, -28));
    g.fillStyle = grad;
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();

    g.save();
    g.beginPath(); g.arc(0, 0, r * 0.97, 0, Math.PI * 2); g.clip();
    g.rotate(b.angle + b.roll);
    g.lineCap = 'round';
    g.strokeStyle = col.swirl; g.globalAlpha = 0.55; g.lineWidth = r * 0.34;
    g.beginPath();
    g.moveTo(-r * 0.85, 0);
    g.bezierCurveTo(-r * 0.3, -r * 0.9, r * 0.3, r * 0.9, r * 0.85, 0);
    g.stroke();
    g.strokeStyle = col.deep; g.globalAlpha = 0.35; g.lineWidth = r * 0.12;
    g.beginPath();
    g.moveTo(-r * 0.8, r * 0.25);
    g.bezierCurveTo(-r * 0.3, -r * 0.6, r * 0.3, r * 1.1, r * 0.8, r * 0.25);
    g.stroke();
    g.restore();

    g.save();                                   // the bounce off the cloth
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.clip();
    g.globalAlpha = 0.42;
    g.strokeStyle = col.swirl; g.lineWidth = r * 0.24;
    g.beginPath(); g.arc(0, 0, r * 0.93, Math.PI * 0.14, Math.PI * 0.84); g.stroke();
    g.globalAlpha = 0.16;
    g.fillStyle = '#ffffff';
    g.beginPath(); g.ellipse(r * 0.28, r * 0.44, r * 0.38, r * 0.17, 0.5, 0, Math.PI * 2); g.fill();
    g.restore();

    g.fillStyle = 'rgba(255,255,255,0.8)';      // the window, and its hotspot
    g.beginPath(); g.ellipse(-r * 0.37, -r * 0.43, r * 0.28, r * 0.18, -0.7, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath(); g.arc(-r * 0.45, -r * 0.5, r * 0.11, 0, Math.PI * 2); g.fill();
    g.strokeStyle = shade(col.deep, -44); g.globalAlpha = 0.5; g.lineWidth = 1;
    g.beginPath(); g.arc(0, 0, r - 0.5, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 1;
  }

  // A hole is a socket cut through the cloth, ringed by a bezel that says who it
  // pays. The two team bezels are Amber's painted ones; the middle hole, which
  // belongs to nobody, gets plain brass and a dashed line, and so does the hole at
  // the end of a maze. A maze's traps have no bezel at all: they are just a gap
  // worn in the cloth, which is what makes them easy to forget about.
  const BEZEL = 1.93;               // = 1 / 0.52, the sprite's dark middle as a
                                    // fraction of its width, so that middle is the hole

  function drawHole(g, h) {
    const img = h.team === 'you' ? art.ringYou : h.team === 'ai' ? art.ringThem : null;
    const R = h.r * BEZEL;
    if (h.trap) {
      g.save();
      g.strokeStyle = 'rgba(4, 18, 9, 0.55)'; g.lineWidth = 5;
      g.beginPath(); g.arc(h.x, h.y, h.r + 2, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = 'rgba(170, 214, 170, 0.14)'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(h.x, h.y, h.r + 4.5, Math.PI * 0.05, Math.PI * 0.95); g.stroke();
      g.restore();
    } else if (img) {
      g.drawImage(img, h.x - R, h.y - R, R * 2, R * 2);
    } else if (h.team) {                            // a band of lacquer, if the art is missing
      const c = TEAM[h.team].colour;
      g.save();
      g.globalAlpha = 0.9;
      g.strokeStyle = c.deep; g.lineWidth = 8;
      g.beginPath(); g.arc(h.x, h.y, h.r + 9, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = c.base; g.lineWidth = 5;
      g.beginPath(); g.arc(h.x, h.y, h.r + 9, 0, Math.PI * 2); g.stroke();
      g.restore();
    } else {
      g.save();
      const mid = (R + h.r) / 2 + 1;
      const br = g.createLinearGradient(h.x - R, h.y - R, h.x + R, h.y + R);
      br.addColorStop(0, '#f0d795'); br.addColorStop(0.45, '#b08a42');
      br.addColorStop(0.6, '#d9bb72'); br.addColorStop(1, '#6b5120');
      g.strokeStyle = br; g.lineWidth = R - h.r - 2;
      g.beginPath(); g.arc(h.x, h.y, mid, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = 'rgba(24, 14, 4, 0.6)'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(h.x, h.y, R - 1.5, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = 'rgba(38, 24, 8, 0.5)'; g.lineWidth = 2.5; g.setLineDash([7, 9]);
      g.beginPath(); g.arc(h.x, h.y, mid, 0, Math.PI * 2); g.stroke();
      g.restore();
    }
    const grad = g.createRadialGradient(h.x, h.y - h.r * 0.25, h.r * 0.12, h.x, h.y, h.r);
    grad.addColorStop(0, '#000000'); grad.addColorStop(0.62, '#0a0704'); grad.addColorStop(1, '#30200f');
    g.fillStyle = grad;
    g.beginPath(); g.arc(h.x, h.y, h.r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255, 232, 186, 0.32)'; g.lineWidth = 2;   // lit far lip
    g.beginPath(); g.arc(h.x, h.y, h.r - 1, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    g.strokeStyle = 'rgba(8, 4, 1, 0.55)'; g.lineWidth = 2;
    g.beginPath(); g.arc(h.x, h.y, h.r - 1, Math.PI * 0.1, Math.PI * 0.9); g.stroke();
  }

  function drawBody(g, b) {
    g.save();
    g.translate(b.x, b.y);
    drawMarble(g, b);
    g.restore();
  }

  // ---------- drawing bowls ----------
  // The mat is a darker strip of cloth at the left, and a dashed brass line a little way out
  // from it is as short as a marble may stop and still count. The house is dyed into the
  // cloth at the far end in the tray's own colours — cream, baize, brass — so it never reads
  // as either side's sky or rose.
  function drawMat(g) {
    g.save();
    const fills = ['rgba(240, 226, 192, 0.2)', 'rgba(4, 22, 10, 0.3)', 'rgba(214, 174, 96, 0.3)', 'rgba(246, 239, 225, 0.55)'];
    HOUSE_RINGS.forEach((r, i) => {
      g.fillStyle = fills[i];
      g.beginPath(); g.arc(HOUSE.x, HOUSE.y, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(246, 232, 196, 0.42)'; g.lineWidth = 1.5;
      g.stroke();
    });
    // the tee line and centre line, as stitched into a sheet of ice
    g.strokeStyle = 'rgba(246, 232, 196, 0.22)'; g.lineWidth = 1; g.setLineDash([4, 6]);
    g.beginPath();
    g.moveTo(HOUSE.x, RIM); g.lineTo(HOUSE.x, H - RIM);
    g.moveTo(MAT_X + 34, HOUSE.y); g.lineTo(W - RIM, HOUSE.y);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = 'rgba(4, 22, 10, 0.26)';
    g.fillRect(RIM, RIM, MAT_X + 34 - RIM, H - 2 * RIM);
    g.strokeStyle = 'rgba(232, 200, 128, 0.32)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(MAT_X + 34, RIM); g.lineTo(MAT_X + 34, H - RIM); g.stroke();
    g.strokeStyle = 'rgba(232, 200, 128, 0.42)'; g.lineWidth = 2; g.setLineDash([8, 10]);
    g.beginPath(); g.moveTo(DEAD_X, RIM); g.lineTo(DEAD_X, H - RIM); g.stroke();
    g.restore();
  }

  // The shot being lined up: a band back to where it is being pulled from, a line out the way
  // it will go, and a ring where it would come to rest on open cloth with nothing in its way.
  function drawAim(g) {
    const b = bowls.cur;
    if (!b || bowls.phase !== 'aim') return;
    let f = null, band = null;
    if (bowls.aim) {
      const px = bowls.aim.px - bowls.aim.x0, py = bowls.aim.py - bowls.aim.y0;
      if (Math.hypot(px, py) < 10) return;
      f = flickFrom(px, py);
      const k = Math.min(1, PULL_FULL / Math.hypot(px, py));
      band = { x: b.x + px * k, y: b.y + py * k };
    } else if (bowls.plan && bowls.plan.ready) {
      const s = bowls.plan.shot, w = Math.min(1, bowls.plan.t / 0.6);
      f = { vx: s.vx * w, vy: s.vy * w, v: Math.hypot(s.vx, s.vy) * w };
      const pull = PULL_FULL * Math.pow(Math.hypot(s.vx, s.vy) / FLICK_MAX, 2) * w;   // flickFrom, backwards
      const sv = Math.hypot(s.vx, s.vy) || 1;
      band = { x: b.x - s.vx / sv * pull, y: b.y - s.vy / sv * pull };
    }
    if (!f || f.v < 1) return;
    const ux = f.vx / f.v, uy = f.vy / f.v;
    const col = TEAM[b.team].colour;
    g.save();
    roundRect(g, RIM, RIM, W - 2 * RIM, H - 2 * RIM, WELL_R); g.clip();   // the band stays on the cloth
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(236, 218, 176, 0.55)'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(band.x, band.y); g.stroke();
    g.fillStyle = 'rgba(236, 218, 176, 0.8)';
    g.beginPath(); g.arc(band.x, band.y, 4, 0, Math.PI * 2); g.fill();
    // Out to the rest point, or as far as the rim if it would carry further than that.
    let d = rollOut(f.v);
    const room = Math.min(
      ux > 0 ? (W - RIM - b.r - b.x) / ux : ux < 0 ? (RIM + b.r - b.x) / ux : Infinity,
      uy > 0 ? (H - RIM - b.r - b.y) / uy : uy < 0 ? (RIM + b.r - b.y) / uy : Infinity);
    const off = d > room;
    d = Math.min(d, room);
    g.strokeStyle = shade(col.base, 40); g.globalAlpha = 0.8; g.lineWidth = 2; g.setLineDash([3, 8]);
    g.beginPath(); g.moveTo(b.x + ux * (b.r + 4), b.y + uy * (b.r + 4)); g.lineTo(b.x + ux * d, b.y + uy * d); g.stroke();
    g.setLineDash([5, 5]);
    if (!off) { g.beginPath(); g.arc(b.x + ux * d, b.y + uy * d, b.r, 0, Math.PI * 2); g.stroke(); }
    g.restore();
  }

  // The end's result: the marbles that counted, each with a line to the button, and the score
  // across the middle of the tray. While it is being played, the marble lying shot — nearest
  // the button, in the house — wears a ring, so you can see who is holding it.
  function drawEnd(g) {
    if (bowls.phase !== 'scored') {
      const shot = standing(bodies)[0];
      if (shot && shot.b !== bowls.cur) drawRing(g, shot.b, 'rgba(246, 239, 225, 0.7)', 0.25);
      return;
    }
    const j = HOUSE;
    g.save();
    g.strokeStyle = 'rgba(247, 222, 150, 0.75)'; g.lineWidth = 1.5; g.setLineDash([2, 5]);
    for (const b of bowls.scored) { g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(j.x, j.y); g.stroke(); }
    g.restore();
    for (const b of bowls.scored) drawRing(g, b, 'rgba(247, 222, 150, 0.9)', 0.4);
    const bn = bowls.banner;
    if (!bn) return;
    const fade = Math.min(1, bn.t / 0.25);
    g.save();
    g.globalAlpha = fade;
    g.translate(W / 2, H / 2);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '600 54px "Playfair Display", Georgia, "Iowan Old Style", "Times New Roman", serif';
    g.lineWidth = 8; g.lineJoin = 'round'; g.strokeStyle = 'rgba(36, 24, 14, 0.6)';
    g.strokeText(bn.text, 0, 0);
    g.fillStyle = '#f6efe1';
    g.fillText(bn.text, 0, 0);
    g.font = '500 18px "Playfair Display", Georgia, "Iowan Old Style", "Times New Roman", serif';
    g.lineWidth = 5;
    const sub = `${bowls.you} – ${bowls.ai}`;
    g.strokeText(sub, 0, 44);
    g.fillText(sub, 0, 44);
    g.restore();
  }

  let ringPhase = 0;
  function drawRing(g, b, colour, spin) {
    g.save();
    g.translate(b.x, b.y);
    g.rotate(ringPhase * spin);
    g.strokeStyle = colour;
    g.lineWidth = 2;
    g.setLineDash([6, 7]);
    g.beginPath(); g.arc(0, 0, b.bound + 8 + Math.sin(ringPhase) * 1.5, 0, Math.PI * 2); g.stroke();
    g.restore();
  }

  // 3, 2, 1, Go — each beat pops in large and settles while the tray sits still.
  function drawCountdown(g) {
    const n = Math.ceil(match.count) - 1;           // 3 while count is in (3,4], 0 is the off
    const p = Math.ceil(match.count) - match.count; // 0 -> 1 across the beat
    const label = n > 0 ? String(n) : 'Go';
    const pop = p < 0.22 ? 1 + (1 - p / 0.22) * 0.6 : 1;
    const fade = p < 0.08 ? p / 0.08 : p > 0.84 ? (1 - p) / 0.16 : 1;
    g.save();
    g.globalAlpha = 0.3 * fade;
    g.fillStyle = '#2a1c10';
    roundRect(g, 0, 0, W, H, 18); g.fill();
    // The halves are marked out while the numbers run: a click in one puts that side's
    // shooter down there, and neither side may set up in the other's half.
    g.globalAlpha = 0.5 * fade;
    g.strokeStyle = '#f6efe1'; g.lineWidth = 2; g.setLineDash([9, 11]);
    g.beginPath(); g.moveTo(W / 2, RIM); g.lineTo(W / 2, H - RIM); g.stroke();
    g.setLineDash([]);
    g.translate(W / 2, H / 2);
    g.globalAlpha = (1 - p) * 0.5 * fade;           // a ring swelling out from behind the numeral
    g.strokeStyle = '#f6efe1'; g.lineWidth = 3;
    g.beginPath(); g.arc(0, 0, 70 + p * 130, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = fade;
    g.scale(pop, pop);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `600 ${n > 0 ? 132 : 96}px "Playfair Display", Georgia, "Iowan Old Style", "Times New Roman", serif`;
    g.lineWidth = 9; g.lineJoin = 'round'; g.strokeStyle = 'rgba(36, 24, 14, 0.6)';
    g.strokeText(label, 0, 2);
    g.fillStyle = '#f6efe1';
    g.fillText(label, 0, 2);
    g.restore();
    if (n > 0) {
      g.save();
      g.globalAlpha = 0.92 * fade;
      g.translate(W / 2, H - 62);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '500 21px "Playfair Display", Georgia, "Iowan Old Style", "Times New Roman", serif';
      g.lineWidth = 6; g.lineJoin = 'round'; g.strokeStyle = 'rgba(36, 24, 14, 0.6)';
      const hint = match.two
        ? 'Click each half to set the shooters down'
        : 'Click your half to set your shooter down';
      g.strokeText(hint, 0, 0);
      g.fillStyle = '#f6efe1';
      g.fillText(hint, 0, 0);
      g.restore();
    }
  }

  function draw(dt) {
    ringPhase += dt * 1.6;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(bg, 0, 0, W, H);
    if (bowls.on) drawMat(ctx);
    for (const h of holes) drawHole(ctx, h);

    // A marble on its way down is clipped to its hole, so it vanishes into it.
    for (const sk of sinking) {
      const t = Math.min(1, sk.t / SINK_TIME), e = t * t;
      ctx.save();
      ctx.beginPath(); ctx.arc(sk.h.x, sk.h.y, sk.h.r - 1, 0, Math.PI * 2); ctx.clip();
      ctx.globalAlpha = 1 - e * 0.85;
      ctx.translate(sk.h.x + (sk.b.x - sk.h.x) * (1 - e), sk.h.y + (sk.b.y - sk.h.y) * (1 - e) + e * 10);
      ctx.scale(1 - e * 0.7, 1 - e * 0.7);
      ctx.translate(-sk.b.x, -sk.b.y);
      drawBody(ctx, sk.b);
      ctx.restore();
    }

    for (const b of bodies) drawShadow(ctx, b);
    if (match.on && match.theirs) drawRing(ctx, match.theirs, 'rgba(240, 150, 165, 0.85)', -0.4);
    if (mt.ctrl) drawRing(ctx, mt.ctrl, 'rgba(247, 222, 150, 0.85)', 0.4);
    if (bowls.on) {
      // Whose marble is waiting on the mat: brass for a hand on this keyboard, rose for the computer.
      const b = bowls.cur;
      if (b && bowls.phase === 'aim') {
        drawRing(ctx, b, humanTurn() ? 'rgba(247, 222, 150, 0.85)' : 'rgba(240, 150, 165, 0.85)', 0.4);
      }
      drawAim(ctx);
    }
    for (const b of bodies) drawBody(ctx, b);
    if (bowls.on) drawEnd(ctx);
    if (match.on && !match.over && match.count > 0) {
      if (match.waiting) {
        ctx.save(); ctx.globalAlpha = 0.3; ctx.fillStyle = '#2a1c10';
        roundRect(ctx, 0, 0, W, H, 18); ctx.fill(); ctx.restore();
      } else drawCountdown(ctx);
    }
  }


  function updateMatchUI() {
    const left = { you: 0, ai: 0 };
    for (const b of inPlay()) left[b.team]++;
    $('score-you').textContent = match.you;
    $('score-ai').textContent = match.ai;
    $('left-you').textContent = `${left.you} on the tray`;
    $('left-ai').textContent = `${left.ai} on the tray`;
  }


  function setLevel(i) {
    match.level = i;
    document.querySelectorAll('#levels button').forEach((el, j) => el.classList.toggle('on', j === i));
  }

  // Who plays rose: the computer, or somebody sat next to you — on the arrow keys in a match,
  // and taking turns with the pointer at bowls.
  function setTwo(on) {
    match.two = !!on;
    $('opp-one').classList.toggle('on', !match.two);
    $('opp-one').setAttribute('aria-pressed', String(!match.two));
    $('opp-two').classList.toggle('on', match.two);
    $('opp-two').setAttribute('aria-pressed', String(match.two));
    $('levels').hidden = match.two;
    $('opp-sub').textContent = !match.two ? 'How keen it is' : mt.mode === 'bowls' ? 'Taking turns' : 'Sharing the keyboard';
    $('two-note').hidden = !match.two;
    $('who-ai').textContent = match.two ? 'Player two' : 'Opponent';
    $('who-you').textContent = match.two ? 'Player one' : 'You';
    twoNote();
    if (mt.mode === 'match') startMatch();       // the scores so far would mean nothing now
    else if (mt.mode === 'bowls') startBowls();
  }

  function twoNote() {
    $('opp-sub').textContent = !match.two ? 'How keen it is' : mt.mode === 'bowls' ? 'Taking turns' : 'Sharing the keyboard';
    $('two-note').innerHTML = mt.mode === 'bowls'
      ? 'Take turns with the pointer: player one rolls sky, player two rose.'
      : 'Player one drives the sky shooter on <b>WASD</b>, player two the rose shooter on the '
        + '<b>arrows</b>. Both set their shooter down during the 3, 2, 1.';
  }

  function setMode(m) {
    m = selectMode(m);
    $('result').hidden = true;
    for (const x of MODES) {
      $('mode-' + x).classList.toggle('on', x === m);
      $('mode-' + x).setAttribute('aria-pressed', String(x === m));
    }
    // Each game takes only the panels it uses.
    $('panel-score').hidden = m === 'maze';
    $('panel-holes').hidden = m !== 'match';
    $('panel-opp').hidden = m === 'maze';
    $('panel-maze').hidden = m !== 'maze';
    $('panel-bowls').hidden = m !== 'bowls';
    $('panel-pad').hidden = m === 'bowls';
    canvas.classList.toggle('aiming', m === 'bowls');
    twoNote();
    if (m === 'match') $('score-sub').textContent = 'All twelve go in';
    refreshUi();
    paintCase();                              // the maze's rails come and go with it
  }

  // ---------- saved ----------
  // Which game was on the tray last, how far through the mazes you have got and your best time
  // on each. v1 and v2 were the sandbox's kept trays; there is no sandbox to load them into now.
  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(store)); } catch (_) { /* ignore */ } };


  function renderMazeUI() {
    $('maze-sub').textContent = `${maze.level + 1} of ${MAZES.length}`;
    const best = store.maze.best[String(maze.level)];
    $('maze-best').textContent = best == null ? '—' : clock(best);
    $('maze-time').textContent = clock(maze.t);
    const host = $('maze-levels');
    host.innerHTML = '';
    MAZES.forEach((_, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = String(i + 1);
      const t = store.maze.best[String(i)];
      b.title = i > store.maze.reached ? 'Get through the one before it first'
        : t == null ? `Maze ${i + 1}` : `Maze ${i + 1} — best ${clock(t)}`;
      b.disabled = i > store.maze.reached;
      b.classList.toggle('on', i === maze.level);
      if (t != null) b.classList.add('done');
      b.addEventListener('click', () => startMaze(i));
      host.appendChild(b);
    });
  }

  function updateBowlsUI() {
    $('score-you').textContent = bowls.you;
    $('score-ai').textContent = bowls.ai;
    const left = n => n === 0 ? 'all bowled' : `${n} to bowl`;
    $('left-you').textContent = left(bowls.left.you);
    $('left-ai').textContent = left(bowls.left.ai);
    $('score-sub').textContent = `End ${bowls.end} · first to ${BOWLS_TO}`;
  }


  // ---------- pointer ----------
  function toWorld(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  }

  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    sound.ensure();
    const p = toWorld(e);
    if (match.on) {
      // Dragging by hand would trivially win a match. The one thing a click does is set a
      // shooter down while the numbers run, in that side's half; after the off, nothing.
      if (!match.over && !match.waiting && match.count > 0) {
        const side = p.x < W / 2 ? 'you' : 'ai';
        if (side === 'you') placeShooter(match.yours, p.x, p.y);
        else if (match.two) placeShooter(match.theirs, p.x, p.y);
        sound.tap();
      }
    } else if (bowls.on) {
      if (bowls.phase === 'scored' && bowls.t > 0.6) afterEnd();          // a click moves things on
      else if (humanTurn() && bowls.cur) {
        // Anywhere on the tray will do to pull back from — it is the pull that aims, not
        // where it starts — so a thumb never has to cover the marble it is aiming.
        bowls.aim = { id: e.pointerId, x0: p.x, y0: p.y, px: p.x, py: p.y };
        try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      }
    }
    e.preventDefault();
  });

  window.addEventListener('pointermove', e => {
    if (bowls.aim && e.pointerId === bowls.aim.id) {
      const p = toWorld(e);
      bowls.aim.px = p.x; bowls.aim.py = p.y;
    }
  });

  function pointerEnd(e) {
    const a = bowls.aim;
    if (!a || e.pointerId !== a.id) return;
    bowls.aim = null;
    if (e.type !== 'pointerup' || !humanTurn() || !bowls.cur) return;
    const px = a.px - a.x0, py = a.py - a.y0;
    if (Math.hypot(px, py) < 10) {
      // Not a pull, a tap: on the mat it moves the marble up or down to there.
      if (a.x0 < DEAD_X) bowls.cur.y = matSpot(a.y0, bowls.cur);
      return;
    }
    const f = flickFrom(px, py);
    throwBowl(f.vx, f.vy);
  }
  window.addEventListener('pointerup', pointerEnd);
  window.addEventListener('pointercancel', pointerEnd);
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // ---------- keyboard ----------
  window.addEventListener('keydown', e => {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.code === 'ShiftLeft') mt.softA = true;
    if (e.code === 'ShiftRight') mt.softB = true;
    const k = KEYMAP[e.code];
    if (k) { (k.s === 'a' ? keysA : keysB).add(k.d); keyDir(); e.preventDefault(); return; }
    // R sends both marbles in a maze back to the mouth of it, for a little one wedged in a
    // blind end where the big one cannot get behind it. The clock keeps going.
    if (e.code === 'KeyR' && maze.on) { mazeHome(); e.preventDefault(); return; }
    if (e.code === 'Escape') { $('help').hidden = true; $('result').hidden = true; }
  });
  window.addEventListener('keyup', e => {
    if (e.code === 'ShiftLeft') mt.softA = false;
    if (e.code === 'ShiftRight') mt.softB = false;
    const k = KEYMAP[e.code];
    if (k) { (k.s === 'a' ? keysA : keysB).delete(k.d); keyDir(); }
  });
  window.addEventListener('blur', () => {
    keysA.clear(); keysB.clear(); mt.softA = false; mt.softB = false; keyDir();
  });

  // ---------- panel buttons ----------
  function restart() {
    if (mt.mode === 'match') startMatch();
    else if (mt.mode === 'maze') startMaze(maze.level);
    else startBowls();
  }

  function buildPanels() {
    for (const m of MODES) $('mode-' + m).addEventListener('click', () => setMode(m));
    $('opp-one').addEventListener('click', () => { if (match.two) setTwo(false); });
    $('opp-two').addEventListener('click', () => { if (!match.two) setTwo(true); });
    $('btn-rematch').addEventListener('click', restart);
    $('btn-play').addEventListener('click', () => {
      sound.ensure();
      match.waiting = false;
      $('btn-play').hidden = true;
    });
    $('btn-result-again').addEventListener('click', () => {
      if (mt.mode === 'maze') startMaze(maze.level + (maze.done && maze.level < MAZES.length - 1 ? 1 : 0));
      else if (mt.mode === 'match') startMatch(true);   // the card's button is already a Play
      else restart();
    });
    $('btn-result-close').addEventListener('click', () => { $('result').hidden = true; });
    const lv = $('levels');
    AI_LEVELS.forEach((l, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = l.name;
      b.addEventListener('click', () => setLevel(i));
      lv.appendChild(b);
    });
    $('btn-maze-home').addEventListener('click', mazeHome);
    $('btn-maze-again').addEventListener('click', () => startMaze(maze.level));

    // The pad is the arrow keys for a thumb: held is held, exactly as a key is.
    $('pad').querySelectorAll('button').forEach(btn => {
      const d = btn.dataset.dir;
      const up = () => { keysA.delete(d); keyDir(); btn.classList.remove('on'); };
      btn.addEventListener('pointerdown', e => {
        sound.ensure();
        keysA.add(d); keyDir(); btn.classList.add('on');
        try { btn.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        e.preventDefault();
      });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(ev, up);
      btn.addEventListener('contextmenu', e => e.preventDefault());
    });

    $('btn-sound').addEventListener('click', () => {
      sound.on = !sound.on;
      if (sound.on) { sound.ensure(); if (sound.ac && sound.ac.state === 'suspended') sound.ac.resume(); }
      $('btn-sound').textContent = sound.on ? 'Sound: on' : 'Sound: off';
      $('btn-sound').setAttribute('aria-pressed', String(sound.on));
    });
    $('btn-help').addEventListener('click', () => { $('help').hidden = false; });
    $('btn-help-close').addEventListener('click', () => { $('help').hidden = true; });
    $('help').addEventListener('click', e => { if (e.target === $('help')) $('help').hidden = true; });
  }

  // ---------- the tray jolts ----------
  // A shake shakes the tray, not only what is in it: the canvas is kicked a few px and a slack
  // spring settles it back. It only ever translates, so the pointer still lands where it should.
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let leanX = 0, leanY = 0, leanVX = 0, leanVY = 0;
  function leanTray(dt) {
    if (reduceMotion || dt <= 0) return;
    leanVX += (-leanX * LEAN_K - leanVX * LEAN_D) * dt;
    leanVY += (-leanY * LEAN_K - leanVY * LEAN_D) * dt;
    leanX += leanVX * dt; leanY += leanVY * dt;
    canvas.style.setProperty('--lean-x', leanX.toFixed(2) + 'px');
    canvas.style.setProperty('--lean-y', leanY.toFixed(2) + 'px');
  }

  function jolt(px) {
    if (reduceMotion) return;
    const a = rand(0, Math.PI * 2);
    leanVX += Math.cos(a) * px; leanVY += Math.sin(a) * px;
  }

  try { localStorage.removeItem('marble-tray-log-v1'); } catch (e) { /* storage blocked */ }   // the old play log

  // ---------- main loop ----------
  let last = performance.now();
  function frame(now) {
    let dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    if (document.hidden) dt = 0;

    const counting = tick(dt, now);
    leanTray(dt);

    if (soundQueue.length) {
      for (const s of soundQueue) sound.hit(s.a, s.b, s.speed);
      soundQueue.length = 0;
    }
    $('btn-play').hidden = !(counting && match.waiting);
    draw(dt);
    requestAnimationFrame(frame);
  }

  buildPanels();
  setLevel(match.level);
  setTwo(false);
  setMode(store.mode);
  requestAnimationFrame(frame);

  // Exposed for testing in a console: window.__tray.bodies etc.
  expose('__tray', {
    bodies, holes, sinking, match, maze, bowls, add, setMode, setLevel, startMatch,
    setControl, setTwo, placeShooter, planShots, aiThink, matchIdle, rescueStuck,
    get ctrl() { return mt.ctrl; },
    get ctrl2() { return mt.ctrl2; }, get mode() { return mt.mode; }, KINDS,
    fixtures, walls, store, MAZES, startMaze, mazeHome, unwedge, exits, cellX, cellY,
    startBowls, throwBowl, flickFrom, planBowl, simulate, standing, scoreEnd, afterEnd, rollOut,
    step, SUBSTEPS, tick, seedDice: mt.seedDice, sim: mt,
    SINK_SPEED, HOLE_R, GOAL_R, TRAP_R, MAZE_WALL, STEER_MIN, STEER_MAX, STEER_RAMP, SHAKE_WAIT, SHAKE_GIVE_UP,
    FLICK_MAX, PULL_FULL, MAT_X, DEAD_X, BOWLS_EACH, BOWLS_TO, HOUSE, HOUSE_RINGS,
  });
