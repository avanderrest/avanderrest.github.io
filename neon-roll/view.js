/* Neon Roll: the screen. The neon backdrop, the tube, the ball and its trail, the landing
   marker, the HUD, the synth sound, and the one button. See sim.js for the physics. */
import { createRoll } from './sim.js';
import { readSeed, writeSeed } from '../lib/seed.js';
import { newSeed } from '../lib/rng.js';
import { expose } from '../lib/debug.js';

  // A #seed= in the address is a track somebody shared: the first run is on it. Every new
  // track is written back, so the address is always the track in front of you.
  const SAVE_KEY = 'neon-roll-save-v1';
  let pinned = readSeed();
  const pickSeed = () => { if (pinned != null) { const s = pinned; pinned = null; return s; } return newSeed() & 0x7fffffff; };
  const save = freshSave();
  const nr = createRoll({ save, on: onEvent, pickSeed });
  const {
    mulberry32, hsl, skinRGB, makeTrack, newBall, resetWorld, startRun, finish, tick, rollStep, takeOff, leaveGround, flyStep, touchDown, judge, ignite, fell, predictLanding, PX_PER_M, STEP, G, AIR_G, CRUISE, FLOW_SPEED, FLOW_MAX, FLOW_POP, BASE_POP, CRUISE_PULL, CRUISE_EASE, CLIMB_ASSIST, CRUISE_FLOOR, HOLD_G, DIVE_G, DRAG, ROLL, MAX_SPEED, R, PERFECT_DEG, GOOD_DEG, GLIDE_STREAK, GLIDE_G, SETTLE, HOP_AIR, GOOD_KEEP, SLAM_MIN, LIP_KINK, LIP_CURVE, BOOST_MARGIN, LAND_SLOPE, LAND_RUN, RAMP_Q, RIPPLE, RIPPLE_SLOPE, BIG_HILL, BIG_SLOPE, SWELL_MIN, SWELL_HOLD, BIG_WAVE, LAUNCH_KEEP, REACH_FIT, PERFECT_KICK, FEVER_STREAK, FEVER_TIME, FEVER_KICK, FEVER_PUSH, BIG_AIR, START_SPEED, CHASE_START, CHASE_RAMP, CHASE_MAX, CHASE_LAG, CHASE_OPEN, AIRTIME_LENGTH, AIR_FALL, SPRINT_M, SPRINT_SEED, SPRINT_FALL, NO_PROGRESS, PROGRESS_PX, RESPAWN_SPEED, FALL_DEPTH, ZONE_M, LEAD_FROM, MODES, ZONES, SKINS, LIME, RED, FIRE, WHITE, clamp, lerp, rgba, mix, S, O, Q, cruise, gliding, airG, selectMode,
  } = nr;
  Object.assign(save, loadSave());

  function onEvent(ev, d) {
    switch (ev) {
      case 'sfx': Snd.sfx(d); break;
      case 'burst': burst(d.x, d.y, d.col, d.n, d.speed); break;
      case 'say': say(d.txt, d.col, d.life, d.dy); break;
      case 'shake': fx.shake = Math.max(fx.shake, d); break;
      case 'flash': fx.flash = d; break;
      case 'trail-reset': fx.trail.length = 0; break;
      case 'reset':
        fx.parts.length = 0; fx.texts.length = 0; fx.trail.length = 0;
        snapCamera();
        if (S.mode !== 'sprint') writeSeed(d);
        break;
      case 'run': panel.hidden = true; break;
      case 'finish': showPanel(); break;
      case 'save': persist(); break;
    }
  }

  // ---------- save ----------
  function freshSave() {
    return {
      v: 1, shards: 0, owned: ['cyan'], skin: 'cyan', sound: false, mode: 'endless',
      best: { endless: { score: 0, dist: 0 }, airtime: { air: 0 }, sprint: { time: 0 }, gaps: { dist: 0 } },
    };
  }

  function loadSave() {
    const d = freshSave();
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s && s.v === 1) {
        Object.assign(d, s);
        d.best = Object.assign(freshSave().best, s.best);
        if (!Array.isArray(d.owned) || !d.owned.includes('cyan')) d.owned = ['cyan'].concat(d.owned || []);
        if (!MODES[d.mode]) d.mode = 'endless';
      }
    } catch (e) { /* private window or corrupt: start fresh */ }
    return d;
  }

  let wiping = false; // set on the way out of a full restart, so the unload save can't put it back
  function persist() {
    if (wiping) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* storage blocked */ }
  }

  // ---------- page ----------
  const stage = document.getElementById('stage');
  const cv = document.getElementById('screen');
  const ctx = cv.getContext('2d');
  const panel = document.getElementById('panel');
  const $ = (id) => document.getElementById(id);

  let W = 800, H = 500, DPR = 1;
  let sunCanvas = null;

  function resize() {
    const r = stage.getBoundingClientRect();
    W = Math.max(200, r.width); H = Math.max(160, r.height);
    DPR = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    sunCanvas = null;
    snapCamera();
  }

  const cam = { x: 0, y: 0, s: 1 };
  const fx = { parts: [], texts: [], trail: [], shake: 0, flash: 0 };

  function setMode(mode) {
    if (!selectMode(mode)) return;
    save.mode = mode; persist();
    document.querySelectorAll('.mode').forEach((b) => {
      const on = b.dataset.mode === mode;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
    });
    showPanel();
  }

  // a fresh run in the same mode, from anywhere; an abandoned run records nothing
  function restart() {
    if (modalOpen()) return;
    releaseAll();
    S.phase = 'menu';
    resetWorld();
    startRun();
  }

  const fmtTime = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

  function showPanel() {
    const m = S.mode, best = save.best[m];
    $('panel-kicker').textContent = MODES[m].label;
    const rows = [];
    const row = (k, v, isBest) => rows.push(`<dt>${k}</dt><dd${isBest ? ' class="best"' : ''}>${v}</dd>`);
    const hint = $('panel-hint');
    $('btn-wipe').hidden = S.phase !== 'paused';
    if (S.phase === 'menu') {
      $('panel-title').textContent = 'Neon Roll';
      $('panel-blurb').textContent = MODES[m].blurb;
      if (m === 'endless' && best.score) { row('best score', best.score); row('furthest', `${best.dist} m`); }
      if (m === 'airtime' && best.air) row('most air', `${best.air.toFixed(1)}s`);
      if (m === 'gaps' && best.dist) row('furthest', `${best.dist} m`);
      if (m === 'sprint' && best.time) row('best time', fmtTime(best.time));
      row('shards', save.shards);
      hint.textContent = 'Hold anywhere, or Space, to roll';
      hint.classList.remove('wait');
    } else if (S.phase === 'paused') {
      $('panel-title').textContent = 'Paused';
      $('panel-blurb').textContent = '';
      hint.textContent = 'Hold, or P, to carry on';
      hint.classList.remove('wait');
    } else {
      const titles = { caught: 'The blackout caught you', void: 'Lost in the void', time: 'Out of time', finish: 'Finished' };
      $('panel-title').textContent = titles[S.overReason] || 'Run over';
      $('panel-blurb').textContent = '';
      const nb = S.newBest, dist = Math.floor(S.dist);
      if (m === 'endless') {
        row('score', dist + S.bonus + (nb.score ? ' &middot; best!' : ''), nb.score);
        row('distance', `${dist} m`, nb.dist);
        if (!nb.score) row('best', best.score);
      } else if (m === 'airtime') {
        row('in the air', `${S.airSec.toFixed(1)}s` + (nb.air ? ' &middot; best!' : ''), nb.air);
        if (!nb.air && best.air) row('best', `${best.air.toFixed(1)}s`);
        row('distance', `${dist} m`);
      } else if (m === 'gaps') {
        row('distance', `${dist} m` + (nb.dist ? ' &middot; best!' : ''), nb.dist);
        if (!nb.dist) row('best', `${best.dist} m`);
      } else {
        row('time', fmtTime(S.clock + S.penalty) + (nb.time ? ' &middot; best!' : ''), nb.time);
        if (S.penalty) row('falls', `${S.falls} (+${S.penalty}s)`);
        if (!nb.time && best.time) row('best', fmtTime(best.time));
      }
      row('perfects', S.perfects);
      row('shards', `+${S.runShards}`);
      hint.textContent = 'Hold to go again';
      hint.classList.add('wait');
    }
    $('panel-stats').innerHTML = rows.join('');
    panel.hidden = false;
  }

  try { localStorage.removeItem('neon-roll-log-v1'); } catch (e) { /* storage blocked */ }   // the old play log

  // ---------- effects ----------
  function burst(x, y, col, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random() * 0.7);
      fx.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v + speed * 0.3, life: 0, max: 0.4 + Math.random() * 0.5, col, size: 1.5 + Math.random() * 2.5, g: 900 });
    }
  }

  function say(txt, col, life = 0.9, dy = 0) {
    const b = S.ball;
    fx.texts.push({ txt, col, t: 0, life, x: b.x + b.offx, y: b.y + b.offy, dy });
  }

  function updateFx(dt) {
    for (let i = fx.parts.length - 1; i >= 0; i--) {
      const p = fx.parts[i];
      p.life += dt;
      if (p.life >= p.max) { fx.parts.splice(i, 1); continue; }
      p.vy -= p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (let i = fx.texts.length - 1; i >= 0; i--) {
      fx.texts[i].t += dt;
      if (fx.texts[i].t >= fx.texts[i].life) fx.texts.splice(i, 1);
    }
    fx.shake = Math.max(0, fx.shake - dt);
    fx.flash = Math.max(0, fx.flash - dt);

    const b = S.ball;
    if (S.phase === 'run') {
      fx.trail.push({ x: b.x + b.offx, y: b.y + b.offy });
      if (fx.trail.length > 34) fx.trail.shift();
      if (S.fever > 0) {
        for (let i = 0; i < 3; i++) {
          fx.parts.push({
            x: b.x + b.offx + (Math.random() - 0.5) * R, y: b.y + b.offy + (Math.random() - 0.5) * R,
            vx: -(b.on ? b.s : b.vx) * 0.15 + (Math.random() - 0.5) * 60, vy: 60 + Math.random() * 90,
            life: 0, max: 0.25 + Math.random() * 0.3, col: Math.random() < 0.5 ? FIRE : [255, 230, 90], size: 3 + Math.random() * 4, g: -200,
          });
        }
      }
    }
    if (fx.parts.length > 600) fx.parts.splice(0, fx.parts.length - 600);
  }

  // ---------- camera ----------
  function baseScale() {
    // a wide view: at 1300 px/s the ball crosses 1500px in about a second
    return Math.min(W / (W >= H ? 2400 : 1500), H / 900);
  }

  function camTarget() {
    const b = S.ball, T = S.track, base = baseScale();
    const viewW = W / base;
    let low = Infinity;
    for (let i = 0; i <= 14; i++) {
      const X = b.x - 150 + i * (viewW * 0.75 / 14);
      if (T.ground(X, Q)) low = Math.min(low, Q.y);
    }
    if (!isFinite(low)) low = b.y - 200;
    let top = Math.max(b.y, low) + 190, bottom = Math.min(low, b.y) - 130;
    // in the air, keep where the ball will come down in shot, or the landing ring is no use
    const L = S.phase === 'run' && !b.on ? predictLanding(false) : null;   // the let-go landing is the far one
    if (L) { top = Math.max(top, L.y + 190); bottom = Math.min(bottom, L.y - 130); }
    let s = clamp(H / ((top - bottom) * 1.1), base * 0.3, base);
    let cx = b.x + (W / s) * 0.18;
    if (L && L.x > b.x) {
      const left = b.x - 150, right = L.x + 260;
      s = clamp(Math.min(s, W / (right - left)), base * 0.3, base);
      cx = Math.max(cx, (left + right) / 2);
    }
    return { s, x: cx, y: (top + bottom) / 2 };
  }

  function snapCamera() {
    if (!S.track) return;
    const t = camTarget();
    cam.x = t.x; cam.y = t.y; cam.s = t.s;
  }

  function updateCamera(dt) {
    const t = camTarget();
    cam.s += (t.s - cam.s) * (1 - Math.exp(-dt * 2.2));
    const k = 1 - Math.exp(-dt * 7);
    cam.x += (t.x - cam.x) * k;
    cam.y += (t.y - cam.y) * (1 - Math.exp(-dt * 4));
    if (Math.abs(t.x - cam.x) > W / cam.s) cam.x = t.x;   // after a respawn, don't pan across the gap
  }

  const sx = (X) => (X - cam.x) * cam.s + W / 2;
  const sy = (Y) => H / 2 - (Y - cam.y) * cam.s;

  // ---------- drawing ----------
  const STARS = Array.from({ length: 140 }, (_, i) => {
    const r = mulberry32(i * 7919 + 13);
    return { x: r(), y: r() * 0.75, s: 0.5 + r() * 1.3, p: r() * 6.28 };
  });

  function zone() {
    const z = Math.max(0, cam.x) / PX_PER_M / ZONE_M;
    const i = Math.floor(z), f = z - i;
    const a = ZONES[i % ZONES.length], b = ZONES[(i + 1) % ZONES.length];
    const t = clamp((f - 0.85) / 0.15, 0, 1);
    return { tube: mix(a.tube, b.tube, t), sky: mix(a.sky, b.sky, t) };
  }

  function buildSun(r) {
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(r * 2 * DPR);
    const g = c.getContext('2d');
    g.scale(DPR, DPR);
    const gr = g.createLinearGradient(0, 0, 0, r * 2);
    gr.addColorStop(0, '#ffe36b'); gr.addColorStop(0.5, '#ff7a3d'); gr.addColorStop(1, '#ff2fd0');
    g.fillStyle = gr;
    g.beginPath(); g.arc(r, r, r, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 7; i++) {
      const y = r * (1.0 + i * 0.14), h = 1.5 + i * 1.6;
      g.fillRect(0, y, r * 2, h);
    }
    return c;
  }

  function ridge(u, k) {
    return (1 - Math.abs(Math.sin(u * 0.0023 + k))) * 0.55 +
      (1 - Math.abs(Math.sin(u * 0.0061 + k * 2.3))) * 0.3 +
      (1 - Math.abs(Math.sin(u * 0.017 + k * 4.1))) * 0.15;
  }

  function drawBackdrop(z, now) {
    const hz = H * 0.64;
    const sky = ctx.createLinearGradient(0, 0, 0, hz);
    sky.addColorStop(0, '#030108');
    sky.addColorStop(1, rgba(z.sky, 1));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    for (const st of STARS) {
      const x = ((st.x * W - cam.x * 0.01) % W + W) % W;
      ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.35 * Math.sin(now * 0.0015 + st.p)})`;
      ctx.fillRect(x, st.y * hz, st.s, st.s);
    }

    const r = Math.min(W, H) * 0.2;
    if (!sunCanvas) sunCanvas = buildSun(r);
    const sunX = W * 0.68, sunY = hz - r * 0.55;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.shadowColor = 'rgba(255,90,160,0.8)'; ctx.shadowBlur = 40;
    ctx.drawImage(sunCanvas, sunX - r, sunY - r, r * 2, r * 2);
    ctx.restore();

    // two ranges of wireframe mountains, far and near
    const layers = [[0.05, 0.16, 1.7, 0.35], [0.12, 0.24, 5.2, 0.55]];
    for (const [par, hgt, k, al] of layers) {
      ctx.beginPath();
      ctx.moveTo(0, hz);
      for (let x = 0; x <= W + 8; x += 8) ctx.lineTo(x, hz - ridge(x + cam.x * par, k) * H * hgt);
      ctx.lineTo(W, hz);
      ctx.closePath();
      ctx.fillStyle = rgba([8, 3, 18], 0.92);
      ctx.fill();
      ctx.strokeStyle = rgba(z.tube, al * 0.7);
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    // the floor grid, running to the horizon
    const floor = ctx.createLinearGradient(0, hz, 0, H);
    floor.addColorStop(0, '#07020f'); floor.addColorStop(1, '#020006');
    ctx.fillStyle = floor;
    ctx.fillRect(0, hz, W, H - hz);
    ctx.strokeStyle = rgba(z.tube, 0.16);
    ctx.lineWidth = 1;
    ctx.beginPath();
    const rows = 10, scroll = (now * 0.00025) % 1;
    for (let i = 0; i < rows; i++) {
      const t = (i + scroll) / rows;
      const y = hz + (H - hz) * t * t;
      ctx.moveTo(0, y); ctx.lineTo(W, y);
    }
    const vx = W / 2, sp = 70, off = ((cam.x * 0.3) % sp + sp) % sp;
    for (let x = -W * 2 - off; x <= W * 3; x += sp) {
      ctx.moveTo(vx + (x - vx) * 0.04, hz);
      ctx.lineTo(x, H);
    }
    ctx.stroke();
    ctx.strokeStyle = rgba(z.tube, 0.5);
    ctx.beginPath(); ctx.moveTo(0, hz); ctx.lineTo(W, hz); ctx.stroke();
  }

  // runs of screen points along the visible track, broken at gaps
  function trackRuns() {
    const T = S.track, X0 = cam.x - (W / 2 + 30) / cam.s, X1 = cam.x + (W / 2 + 30) / cam.s;
    const step = 5 / cam.s;
    const runs = [], caps = [];
    let cur = null;
    for (const seg of T.segs) {
      if (seg.x1 < X0 || seg.x0 > X1) continue;
      if (seg.kind === 'gap') {
        cur = null;
        caps.push([sx(seg.x0), sy(seg.yTop)], [sx(seg.x1), sy(seg.yLow)]);
        continue;
      }
      if (!cur) { cur = []; runs.push(cur); }
      const a = Math.max(seg.x0, X0), b = Math.min(seg.x1, X1);
      for (let X = a; ; X += step) {
        const XX = Math.min(X, b - 1e-6);
        seg.f(XX, Q);
        cur.push(sx(XX), sy(Q.y));
        if (X >= b) break;
      }
    }
    return { runs, caps };
  }

  function strokeRuns(runs) {
    ctx.beginPath();
    for (const r of runs) {
      ctx.moveTo(r[0], r[1]);
      for (let i = 2; i < r.length; i += 2) ctx.lineTo(r[i], r[i + 1]);
    }
    ctx.stroke();
  }

  function drawTrack(z) {
    const { runs, caps } = trackRuns();
    const col = z.tube;
    // a faint curtain of light hanging under the tube
    for (const r of runs) {
      if (r.length < 4) continue;
      let top = Infinity;
      for (let i = 1; i < r.length; i += 2) top = Math.min(top, r[i]);
      const gr = ctx.createLinearGradient(0, top, 0, top + 320);
      gr.addColorStop(0, rgba(col, 0.13)); gr.addColorStop(1, rgba(col, 0));
      ctx.beginPath();
      ctx.moveTo(r[0], r[1]);
      for (let i = 2; i < r.length; i += 2) ctx.lineTo(r[i], r[i + 1]);
      ctx.lineTo(r[r.length - 2], top + 340);
      ctx.lineTo(r[0], top + 340);
      ctx.closePath();
      ctx.fillStyle = gr;
      ctx.fill();
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const k = clamp(cam.s, 0.45, 1.2);
    for (const [w, a] of [[26, 0.05], [14, 0.12], [7, 0.3], [3.2, 0.85]]) {
      ctx.strokeStyle = rgba(col, a);
      ctx.lineWidth = w * k;
      strokeRuns(runs);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.2 * k;
    strokeRuns(runs);
    // bright ends where the tube breaks
    for (const [x, y] of caps) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, 16 * k);
      g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.3, rgba(col, 0.7)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, 16 * k, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // beads on the tube every few metres, so speed reads even on a straight
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    const T = S.track, gap = 160;
    const X0 = Math.ceil((cam.x - W / 2 / cam.s) / gap) * gap, X1 = cam.x + W / 2 / cam.s;
    for (let X = X0; X <= X1; X += gap) {
      if (!T.ground(X, Q)) continue;
      ctx.fillRect(sx(X) - 1.5, sy(Q.y) - 1.5, 3, 3);
    }
  }

  function drawFinish() {
    if (S.mode !== 'sprint') return;
    const X = SPRINT_M * PX_PER_M, x = sx(X);
    if (x < -50 || x > W + 50) return;
    const T = S.track;
    const y0 = T.ground(X, Q) ? sy(Q.y) : sy(cam.y);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const [w, a] of [[16, 0.08], [6, 0.3], [2, 0.9]]) {
      ctx.strokeStyle = rgba(LIME, a); ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 - 260 * cam.s); ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = rgba(LIME, 0.95);
    ctx.font = `700 ${Math.round(14 + 6 * cam.s)}px Orbitron, ui-monospace, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('FINISH', x, y0 - 270 * cam.s);
  }

  function drawShards(now) {
    const T = S.track, col = skinRGB(save.skin, S.t);
    const r = Math.max(4, 7 * cam.s);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const sh of T.shards) {
      if (sh.got) continue;
      const x = sx(sh.x), y = sy(sh.y);
      if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
      const pulse = 1 + 0.15 * Math.sin(now * 0.006 + sh.x * 0.01);
      ctx.fillStyle = rgba(col, 0.18);
      ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgba(mix(col, WHITE, 0.5), 0.95);
      ctx.beginPath();
      ctx.moveTo(x, y - r * pulse); ctx.lineTo(x + r * 0.65, y); ctx.lineTo(x, y + r * pulse); ctx.lineTo(x - r * 0.65, y);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawChaser(now) {
    if (S.mode !== 'endless' || S.noChase || S.phase === 'menu') return;
    const x = sx(S.chaseX);
    if (x < -40) return;
    ctx.save();
    ctx.fillStyle = 'rgba(2,0,6,0.94)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let y = 0; y <= H; y += 12) ctx.lineTo(x + Math.sin(y * 0.09 + now * 0.02) * 6 + (Math.random() - 0.5) * 8, y);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    for (const [col, off] of [[[255, 47, 208], -3], [[34, 230, 255], 3]]) {
      ctx.strokeStyle = rgba(col, 0.6); ctx.lineWidth = 2;
      ctx.beginPath();
      for (let y = 0; y <= H; y += 12) {
        const xx = x + off + Math.sin(y * 0.09 + now * 0.02) * 6 + (Math.random() - 0.5) * 8;
        if (y === 0) ctx.moveTo(xx, y); else ctx.lineTo(xx, y);
      }
      ctx.stroke();
    }
    ctx.restore();
    const near = (S.ball.x - S.chaseX) / PX_PER_M;
    if (near < 15 && S.phase === 'run') {
      const a = (1 - near / 15) * 0.35;
      const g = ctx.createLinearGradient(0, 0, W * 0.4, 0);
      g.addColorStop(0, rgba(RED, a)); g.addColorStop(1, rgba(RED, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W * 0.4, H);
    }
  }
  const gradeCol = (g) => (g === 'perfect' ? LIME : g === 'good' ? [255, 190, 60] : RED);
  function drawLanding(now) {
    const b = S.ball;
    if (S.phase !== 'run' || b.on || b.air < 0.12) return;
    const L = predictLanding(false);
    if (!L) return;
    const D = predictLanding(true);
    if (D) {
      const dx = sx(D.x), dy = sy(D.y), dr = 6, dc = gradeCol(D.grade);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba(dc, 0.55); ctx.strokeStyle = rgba(dc, 0.9); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(dx, dy - dr); ctx.lineTo(dx + dr, dy); ctx.lineTo(dx, dy + dr); ctx.lineTo(dx - dr, dy); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    const col = gradeCol(L.grade);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // the path, as a fading dotted line
    for (let i = 0; i < L.path.length; i += 2) {
      const a = 0.35 * (1 - i / L.path.length);
      ctx.fillStyle = rgba(col, a);
      ctx.fillRect(sx(L.path[i]) - 1.5, sy(L.path[i + 1]) - 1.5, 3, 3);
    }
    // a ring where it touches down, pulsing
    const x = sx(L.x), y = sy(L.y), r = 9 + 2 * Math.sin(now * 0.012);
    ctx.strokeStyle = rgba(col, 0.95); ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = rgba(col, 0.35);
    ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawBall(now) {
    const b = S.ball;
    const col = S.fever > 0 ? mix(skinRGB(save.skin, S.t), FIRE, 0.7) : skinRGB(save.skin, S.t);
    const r = Math.max(6, R * cam.s);
    const x = sx(b.x + b.offx), y = sy(b.y + b.offy);

    // trail
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'butt';                  // round caps overlap and add up into beads
    const tr = fx.trail, n = tr.length;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      ctx.strokeStyle = rgba(S.fever > 0 ? mix(col, [255, 230, 90], t) : col, t * 0.5);
      ctx.lineWidth = r * 1.4 * t;
      ctx.beginPath(); ctx.moveTo(sx(tr[i - 1].x), sy(tr[i - 1].y)); ctx.lineTo(sx(tr[i].x), sy(tr[i].y)); ctx.stroke();
    }
    const halo = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * (S.fever > 0 ? 4.5 : 3.2));
    halo.addColorStop(0, rgba(col, 0.55)); halo.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(x, y, r * 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    if (gliding() && !b.on && S.phase === 'run') {
      // wings: two soft sweeps either side, beating slowly, folded while diving
      const spread = S.held ? 0.35 : 1, beat = Math.sin(now * 0.008) * 0.25;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(mix(col, WHITE, 0.4), 0.8);
      ctx.lineWidth = Math.max(2, r * 0.25);
      ctx.lineCap = 'round';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(x + side * r * 0.6, y);
        ctx.quadraticCurveTo(x + side * r * 2.2 * spread, y - r * (1.6 + beat) * spread, x + side * r * 3.4 * spread, y - r * (0.4 + beat) * spread);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.fillStyle = S.fever > 0 ? '#3a1204' : '#0a0514';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-b.ang);                    // screen y is flipped, so the spin is too
    ctx.strokeStyle = rgba(mix(col, WHITE, 0.3), 0.9);
    ctx.lineWidth = Math.max(1.5, r * 0.16);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.55, -0.6, 0.6); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.55, Math.PI - 0.6, Math.PI + 0.6); ctx.stroke();
    ctx.fillStyle = rgba(mix(col, WHITE, 0.5), 0.95);
    ctx.beginPath(); ctx.arc(0, -r * 0.55, r * 0.14, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = rgba(mix(col, WHITE, 0.25), 1);
    ctx.lineWidth = Math.max(2, r * 0.22);
    ctx.beginPath(); ctx.arc(x, y, r * 0.9, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.18, 0, Math.PI * 2); ctx.fill();
  }

  function drawParts() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of fx.parts) {
      const a = 1 - p.life / p.max;
      ctx.fillStyle = rgba(p.col, a);
      const s = p.size * Math.max(0.6, cam.s);
      ctx.fillRect(sx(p.x) - s / 2, sy(p.y) - s / 2, s, s);
    }
    ctx.restore();
  }

  function glowText(txt, x, y, size, col, align = 'left', alpha = 1) {
    ctx.font = `800 ${size}px Orbitron, ui-monospace, "Cascadia Mono", Consolas, monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.save();
    ctx.shadowColor = rgba(col, 0.9 * alpha); ctx.shadowBlur = size * 0.6;
    ctx.fillStyle = rgba(mix(col, WHITE, 0.55), alpha);
    ctx.fillText(txt, x, y);
    ctx.restore();
  }

  function drawTexts() {
    for (const t of fx.texts) {
      const k = t.t / t.life;
      const a = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      glowText(t.txt, sx(t.x), sy(t.y) - 40 - k * 36 + t.dy, 18 + (t.txt.length < 6 ? 4 : 0), t.col, 'center', a);
    }
  }

  function drawHud() {
    if (S.phase === 'menu') return;
    const b = S.ball, cyan = [34, 230, 255], pink = [255, 47, 208];
    const small = W < 520;
    const big = small ? 22 : 28;
    glowText(`${Math.floor(S.dist)} m`, 16, 16 + big, big, cyan);
    let line2 = '';
    if (S.mode === 'endless') line2 = `SCORE ${Math.floor(S.dist) + S.bonus}`;
    else if (S.mode === 'sprint') line2 = fmtTime(S.clock + S.penalty) + `  / ${SPRINT_M} m`;
    else line2 = `${S.perfects} perfect`;
    glowText(line2, 16, 16 + big + 22, 14, pink);
    const kmh = Math.round(Math.abs(b.on ? b.s : Math.hypot(b.vx, b.vy)) / PX_PER_M * 3.6);
    glowText(`${kmh} km/h`, 16, 16 + big + 42, 12, [200, 190, 255], 'left', 0.8);

    // streak pips, or the fever bar while burning
    const px = 16, py = 16 + big + 58;
    if (S.fever > 0) {
      ctx.fillStyle = rgba(FIRE, 0.25); ctx.fillRect(px, py, 90, 6);
      ctx.fillStyle = rgba(FIRE, 0.95); ctx.fillRect(px, py, 90 * S.fever / FEVER_TIME, 6);
    } else {
      for (let i = 0; i < FEVER_STREAK; i++) {
        const on = i < S.streak % FEVER_STREAK;
        const x = px + 6 + i * 16, y = py + 3;
        ctx.fillStyle = on ? rgba(LIME, 1) : 'rgba(255,255,255,0.18)';
        ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 4, y); ctx.closePath(); ctx.fill();
      }
    }

    if (S.flow > 0) glowText(`FLOW ×${S.flow}`, px + 104, py + 7, 12, S.flow >= FLOW_MAX ? FIRE : LIME, 'left', 0.9);
    if (gliding()) glowText('GLIDE', px + 104, py + 24, 12, [34, 230, 255], 'left', 0.9);

    glowText(`◆ ${S.runShards}`, W - 16, 16 + 22, 20, skinRGB(save.skin, S.t), 'right');

    if (S.mode === 'airtime') {
      const low = S.clock < 5;
      glowText(S.clock.toFixed(1), W / 2, 16 + 34, 34, low ? RED : cyan, 'center');
      glowText(`in the air ${S.airSec.toFixed(1)}s`, W / 2, 16 + 52, 12, b.on ? [200, 190, 255] : LIME, 'center', 0.9);
    }
    if (S.mode === 'endless' && !S.noChase && S.phase === 'run') {
      const near = Math.max(0, (b.x - S.chaseX) / PX_PER_M);
      if (near < 30) glowText(`blackout ${near.toFixed(0)} m`, W - 16, 16 + 44, 12, RED, 'right');
    }

    const lost = S.phase === 'run' && S.noProgT > NO_PROGRESS;
    if (lost) glowText('getting nowhere? press R to restart', W / 2, H - 44, 13, [255, 150, 200], 'center', 0.9);
    stageRestart.hidden = !lost;

    // the button itself, lit while held
    if (S.phase === 'run') {
      const x = W / 2, y = H - 22, on = S.held;
      ctx.strokeStyle = on ? rgba(LIME, 0.9) : 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke();
      if (on) { ctx.fillStyle = rgba(LIME, 0.5); ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); }
    }
  }

  function render(now) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const z = zone();
    drawBackdrop(z, now);
    ctx.save();
    if (fx.shake > 0) ctx.translate((Math.random() - 0.5) * fx.shake * 24, (Math.random() - 0.5) * fx.shake * 24);
    drawTrack(z);
    drawFinish();
    drawShards(now);
    drawLanding(now);
    drawBall(now);
    drawParts();
    drawChaser(now);
    drawTexts();
    ctx.restore();
    if (fx.flash > 0) { ctx.fillStyle = `rgba(255,240,220,${fx.flash * 0.5})`; ctx.fillRect(0, 0, W, H); }
    drawHud();
  }

  // ---------- sound ----------
  /* Web Audio only. The music's tempo follows the ball's speed. A low hum that rises with speed on the track (no hiss of
     wind or whoosh on take-off: it sounded like a sledge on snow), blips for
     landings and shards, and a small synthwave loop: bass on the
     eighths and an arpeggio on the sixteenths over Am F C G. */
  const Snd = (() => {
    let ac = null, master = null, music = null, on = false;
    let hum, humGain;
    let nextNote = 0, stepN = 0;
    const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
    const CHORDS = [[45, 0, 3, 7], [41, 0, 4, 7], [48, 0, 4, 7], [43, 0, 4, 7]];
    const ARP = [0, 1, 2, 3, 2, 1, 2, 3];
    // the tempo follows the ball: BPM_SLOW rolling along, BPM_FAST flat out, eased so it never lurches
    const BPM_SLOW = 88, BPM_FAST = 150, SPEED_SLOW = 450, SPEED_FAST = 1500;
    let bpm = 110, SIX = 60 / bpm / 4;

    function init() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
      music = ac.createGain(); music.gain.value = 0.22; music.connect(master);
      hum = ac.createOscillator(); hum.type = 'triangle'; hum.frequency.value = 60;
      humGain = ac.createGain(); humGain.gain.value = 0;
      hum.connect(humGain).connect(master); hum.start();
      nextNote = ac.currentTime + 0.1;
    }

    function voice(freq, t, dur, type, vol, cutoff, dest, slide) {
      const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
      f.type = 'lowpass'; f.frequency.value = cutoff;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f).connect(g).connect(dest || master);
      o.start(t); o.stop(t + dur + 0.02);
    }

    function noiseHit(t, dur, vol, cutoff) {
      const n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      s.buffer = buf; f.type = 'lowpass'; f.frequency.value = cutoff; g.gain.value = vol;
      s.connect(f).connect(g).connect(master); s.start(t);
    }

    function sfx(name) {
      if (!on || !ac) return;
      const t = ac.currentTime;
      switch (name) {
        case 'perfect': voice(880, t, 0.12, 'sine', 0.18, 6000); voice(1320, t + 0.06, 0.2, 'sine', 0.16, 6000); break;
        case 'good': voice(660, t, 0.12, 'sine', 0.12, 4000); break;
        // kept at or under the backing music (its kick lands at about 0.055)
        case 'slam': noiseHit(t, 0.18, 0.06, 700); voice(110, t, 0.2, 'sine', 0.06, 600, null, 50); break;
        case 'shard': voice(1760 + Math.random() * 200, t, 0.08, 'sine', 0.08, 8000); break;
        case 'fever': [0, 4, 7, 12, 16].forEach((n, i) => voice(midi(69 + n), t + i * 0.05, 0.2, 'square', 0.07, 3000)); break;
        case 'go': voice(midi(57), t, 0.15, 'square', 0.08, 2000); voice(midi(69), t + 0.08, 0.25, 'square', 0.08, 2500); break;
        case 'over': voice(440, t, 0.7, 'sawtooth', 0.12, 1200, null, 90); break;
        case 'finish': [0, 4, 7, 12].forEach((n, i) => voice(midi(72 + n), t + i * 0.09, 0.3, 'square', 0.08, 3500)); break;
      }
    }

    function update(ball, speed, phase) {
      if (!on || !ac) return;
      const t = ac.currentTime;
      const running = phase === 'run';
      humGain.gain.setTargetAtTime(running && ball.on ? 0.03 + Math.min(0.05, speed / 40000) : 0, t, 0.05);
      hum.frequency.setTargetAtTime(50 + speed * 0.05, t, 0.05);
      music.gain.setTargetAtTime(running ? 0.22 : 0.1, t, 0.3);
      const want = running ? lerp(BPM_SLOW, BPM_FAST, clamp((speed - SPEED_SLOW) / (SPEED_FAST - SPEED_SLOW), 0, 1)) : 100;
      bpm += (want - bpm) * 0.02;             // about a second to follow, at 60 fps
      SIX = 60 / bpm / 4;
      if (nextNote < t) nextNote = t + 0.05;
      while (nextNote < t + 0.15) {
        const bar = Math.floor(stepN / 16) % 4, s = stepN % 16, ch = CHORDS[bar];
        const tones = [ch[1], ch[2], ch[3], ch[1] + 12];
        voice(midi(ch[0] + 24 + tones[ARP[s % 8]]), nextNote, SIX * 0.9, 'square', 0.05, 2200, music);
        if (s % 2 === 0) voice(midi(ch[0] - 12 + (s % 4 === 2 ? 12 : 0)), nextNote, SIX * 1.8, 'sawtooth', 0.12, 500, music);
        if (running && s % 4 === 0) voice(120, nextNote, 0.18, 'sine', 0.25, 400, music, 40);
        nextNote += SIX; stepN++;
      }
    }

    function setOn(v) {
      on = v;
      if (v && !ac) init();
      if (ac) { if (v) ac.resume(); else ac.suspend(); }
    }
    function wake() { if (on && ac && ac.state === 'suspended') ac.resume(); }

    return { sfx, update, setOn, wake, get on() { return on; } };
  })();

  // ---------- input ----------
  const holds = new Set();
  const modalOpen = () => !$('help').hidden || !$('balls').hidden;

  function press(src) {
    if (modalOpen()) return;
    if (save.sound && !Snd.on) Snd.setOn(true);     // browsers want a gesture before any audio
    Snd.wake();
    const first = holds.size === 0;
    holds.add(src);
    S.held = true;
    if (!first) return;
    if (S.phase === 'menu') startRun();
    else if (S.phase === 'over' && S.overT > 0.7) startRun();
    else if (S.phase === 'paused') { S.phase = 'run'; panel.hidden = true; }
  }

  function release(src) {
    holds.delete(src);
    S.held = holds.size > 0;
  }

  function releaseAll() { holds.clear(); S.held = false; }

  function pause() {
    releaseAll();
    if (S.phase === 'run') { S.phase = 'paused'; showPanel(); }
  }

  stage.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    e.preventDefault();
    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* synthetic event */ }
    press('p' + e.pointerId);
  });
  const up = (e) => release('p' + e.pointerId);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  stage.addEventListener('contextmenu', (e) => e.preventDefault());

  const KEYS = new Set(['Space', 'ArrowDown', 'ArrowUp', 'Enter', 'KeyS']);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeModals(); return; }
    if (e.code === 'KeyP' && !modalOpen()) {
      e.preventDefault();
      if (e.repeat) return;
      if (S.phase === 'run') pause();
      else if (S.phase === 'paused') { S.phase = 'run'; panel.hidden = true; }
      return;
    }
    if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey && !e.altKey && !modalOpen()) {
      e.preventDefault();
      if (!e.repeat) restart();
      return;
    }
    if (!KEYS.has(e.code) || modalOpen()) return;
    e.preventDefault();
    if (e.repeat) return;
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    press('k' + e.code);
  });
  window.addEventListener('keyup', (e) => {
    if (!KEYS.has(e.code)) return;
    if (!modalOpen()) e.preventDefault();
    release('k' + e.code);
  });
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(); persist(); } });
  window.addEventListener('pagehide', persist);

  // ---------- chrome ----------
  $('btn-restart').addEventListener('click', () => { $('btn-restart').blur(); restart(); });

  $('btn-pause').addEventListener('click', () => {
    $('btn-pause').blur();
    if (S.phase === 'run') pause();
    else if (S.phase === 'paused') { S.phase = 'run'; panel.hidden = true; }
  });
  // start as if the page had never been opened: bests, shards and balls all gone
  const wipe = $('btn-wipe');
  wipe.addEventListener('pointerdown', (e) => e.stopPropagation());
  wipe.addEventListener('click', () => {
    if (!confirm('Start over from scratch? Every best, shard and ball will be wiped.')) return;
    wiping = true;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* storage blocked */ }
    location.reload();
  });

  // the on-screen restart offer: its press must not also count as the main button
  const stageRestart = $('btn-stage-restart');
  stageRestart.addEventListener('pointerdown', (e) => e.stopPropagation());
  stageRestart.addEventListener('click', () => { stageRestart.blur(); restart(); });
  document.querySelectorAll('.mode').forEach((b) => b.addEventListener('click', () => { setMode(b.dataset.mode); b.blur(); }));

  const btnSound = $('btn-sound');
  function syncSound() {
    btnSound.textContent = `Sound: ${save.sound ? 'on' : 'off'}`;
    btnSound.setAttribute('aria-pressed', save.sound);
  }
  btnSound.addEventListener('click', () => {
    save.sound = !save.sound; persist();
    Snd.setOn(save.sound); syncSound(); btnSound.blur();
  });

  function openModal(id) { pause(); $(id).hidden = false; }
  function closeModals() { $('help').hidden = true; $('balls').hidden = true; }

  $('btn-help').addEventListener('click', () => openModal('help'));
  $('btn-balls').addEventListener('click', () => { drawSkins(); openModal('balls'); });
  document.querySelectorAll('.modal').forEach((m) => {
    m.addEventListener('click', (e) => { if (e.target === m || e.target.classList.contains('close')) closeModals(); });
  });

  function drawSkins() {
    $('purse').textContent = save.shards;
    const box = $('skins');
    box.innerHTML = '';
    for (const sk of SKINS) {
      const owned = save.owned.includes(sk.id);
      const b = document.createElement('button');
      b.className = 'skin' + (save.skin === sk.id ? ' on' : '');
      b.disabled = !owned && save.shards < sk.cost;
      const c = document.createElement('canvas');
      c.width = c.height = 72;
      const g = c.getContext('2d'), col = skinRGB(sk.id, 1.3);
      const halo = g.createRadialGradient(36, 36, 8, 36, 36, 36);
      halo.addColorStop(0, rgba(col, 0.6)); halo.addColorStop(1, rgba(col, 0));
      g.fillStyle = halo; g.fillRect(0, 0, 72, 72);
      g.fillStyle = '#0a0514'; g.beginPath(); g.arc(36, 36, 18, 0, Math.PI * 2); g.fill();
      g.strokeStyle = rgba(mix(col, WHITE, 0.25), 1); g.lineWidth = 4;
      g.beginPath(); g.arc(36, 36, 16, 0, Math.PI * 2); g.stroke();
      b.appendChild(c);
      const label = document.createElement('span');
      label.innerHTML = `<span class="name">${sk.name}</span><span class="cost">${save.skin === sk.id ? 'rolling' : owned ? 'owned' : `◆ ${sk.cost}`}</span>`;
      b.appendChild(label);
      b.addEventListener('click', () => {
        if (!save.owned.includes(sk.id)) {
          if (save.shards < sk.cost) return;
          save.shards -= sk.cost;
          save.owned.push(sk.id);
        }
        save.skin = sk.id;
        persist();
        drawSkins();
        if (S.phase === 'menu') showPanel();
      });
      box.appendChild(b);
    }
  }

  // ---------- loop ----------
  let last = performance.now(), acc = 0, trimT = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!S.frozen) {
      if (S.phase === 'run') {
        acc += dt;
        while (acc >= STEP) { tick(STEP); acc -= STEP; if (S.phase !== 'run') { acc = 0; break; } }
      } else {
        acc = 0;
        if (S.phase === 'over') {
          S.overT += dt;
          if (S.overT > 0.7) $('panel-hint').classList.remove('wait');
          if (S.overReason === 'void') flyStep(dt);
        }
      }
      updateFx(dt);
      if (!(S.phase === 'over' && S.overReason === 'void')) updateCamera(dt);   // let a fall drop out of shot
      trimT += dt;
      if (trimT > 5 && S.phase === 'run') {
        trimT = 0;
        const behind = cam.x - W / cam.s;
        S.track.trim((S.mode === 'endless' ? Math.min(S.chaseX, behind) : behind) - 1500);
      }
    }
    const b = S.ball;
    Snd.update(b, Math.abs(b.on ? b.s : Math.hypot(b.vx, b.vy)), S.phase);
    render(now);
    requestAnimationFrame(frame);
  }

  // ---------- debug handle ----------
  expose('__neonRoll', {
    get state() { return S; },
    get track() { return S.track; },
    get save() { return save; },
    get cam() { return cam; },
    get view() { return { W, H, DPR }; },
    constants: { PX_PER_M, STEP, G, AIR_G, GLIDE_G, GLIDE_STREAK, LIP_CURVE, CRUISE, FLOW_SPEED, FLOW_MAX, HOLD_G, DIVE_G, DRAG, R, SPRINT_M, FEVER_STREAK, PERFECT_DEG, GOOD_DEG, GOOD_KEEP, SLAM_MIN, LIP_KINK },
    setMode,
    // start a run in a mode; opts.seed pins the track, opts.noChase keeps the blackout away
    start(mode, opts = {}) {
      setMode(mode || S.mode);
      if (opts.seed != null) resetWorld(opts.seed);
      S.noChase = !!opts.noChase;
      startRun();
    },
    // advance the simulation by whole physics steps, without drawing
    step(sec) {
      let n = Math.round(sec / STEP);
      while (n-- > 0 && S.phase === 'run') tick(STEP);
      updateCamera(sec);
    },
    hold(v) { S.held = !!v; },
    restart,
    // the track at world x: { y, dy } or null over a gap
    ground(x) { return S.track.ground(x, Q) ? { y: Q.y, dy: Q.dy } : null; },
    predictLanding,
    freeze(v) { S.frozen = !!v; },
    probe() {
      const b = S.ball, on = b.on && S.track.ground(b.x, Q);
      return {
        phase: S.phase, on: !!on, dy: on ? Q.dy : 0, x: b.x, y: b.y, s: b.s, vx: b.vx, vy: b.vy, air: b.air,
        flow: S.flow, dist: S.dist, t: S.t, falls: S.falls, gaps: S.gaps, perfects: S.perfects, slams: S.slams, reason: S.overReason,
        lastLip: S.lastLip,
      };
    },
    snapCamera,
  });

  // ---------- boot ----------
  new ResizeObserver(resize).observe(stage);
  setMode(save.mode);
  resize();
  syncSound();                             // the context itself waits for the first press
  requestAnimationFrame(frame);
