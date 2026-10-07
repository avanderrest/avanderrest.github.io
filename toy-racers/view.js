/* Toy Racers: the screen and the sound. The desk is one canvas: everything static about a
   track (the ground off Amber's plate, the track surfaces, the props) is baked into an
   offscreen layer once when the race loads; only the cars, the skid marks and the
   particles are drawn per frame. Also the follow camera, the HUD and minimap, the menu,
   the engine and the save. See sim.js for the racing. */
import { createRacers, readSave } from './sim.js';
import { expose } from '../lib/debug.js';


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

  // ---------- constants ----------
  const SAVE_KEY = 'toy-racers-save-v2';
  // The game lived in paddock/ until 2026-09-24; carry its saved keys across once.
  [[SAVE_KEY, 'paddock-save-v2']].forEach(([now, was]) => {
    try {
      const old = localStorage.getItem(was);
      if (old !== null && localStorage.getItem(now) === null) localStorage.setItem(now, old);
      localStorage.removeItem(was);
    } catch (e) { /* storage blocked */ }
  });
  const $ = (sel) => document.querySelector(sel);
  // ---------- save ----------

  const save = loadSave();
  const racers = createRacers({ save, on: onEvent });
  const {
    wrapAngle, fmtTime, ordinal, trackProps, gapText, buildTrack, nearest, place, makeCar, layOut, setupRace, stepCar, scale, hitProps, hitCars, slipstream, spendSlipstream, updateProgress, finishCar, standings, driveAi, drivePlayer, rescue, puff, spark, smoke, stepFx, layMarks, endRace, tick, DESK_W, DESK_H, UNITS_PER_CM, STEP, MAX_FRAME, CAM_AREA, CAM_LEAD_T, CAM_LEAD_MAX, CAM_FOLLOW, CAM_ZOOM_IN, SAMPLE_STEP, SEARCH, TRACK_WIDEN, SURF, OFF, GRIP_RATE, TURN, TURN_V, LAT_ACCEL, LAT_FLOOR, TOP_SPEED, ACCEL, BRAKE, REVERSE, ROLL_DRIVE, ROLL_COAST, HANDBRAKE_GRIP, DRIFT_HOLD, SPIN_SLIP, CORNER_A, G_AIR, JUMP_MIN, JUMP_VZ, WET_TIME, WET_GRIP, DRAFT_DIST, DRAFT_CONE, DRAFT_FILL, DRAFT_PULL, BOOST_TIME, BOOST_POWER, CAR_LEN, CAR_WID, CAR_R, RESTITUTION, LAP_OPTS, CLASS_OPTS, RIVALS, COLOURS, PLAYER_COLOURS, DESK_DRESSING, THEMES, COMMON_SPRITES, TRACKS, clamp, lerp, TAU, themeOf, state, keys, HELD,
  } = racers;

  function onEvent(ev, d) {
    switch (ev) {
      case 'sfx': audio[d[0]](...d.slice(1)); break;
      case 'engine': audio.frame(state.player, d); break;
      case 'count': showCount(d); break;
      case 'mark': drawMark(d); break;
      case 'best': flashBest(); break;
      case 'save': persist(); break;
      case 'end': showResults(); break;
    }
  }

  function loadSave() {
    try {
      return readSave(JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'));
    } catch (e) {
      return readSave(null);
    }
  }

  function persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* private mode */ }
  }

  // ---------- art ----------

  // Art arrives a theme at a time, the picked track's first. Nothing waits for
  // it: a race can start on a bare ground and the scene is baked again the
  // moment its pictures land, so a slow connection costs looks, never the race.
  const art = {};
  const themeLoads = {};

  function loadImage(key, ext) {
    if (art[key]) return art[key].ready;
    const img = new Image();
    img.ready = new Promise((done) => { img.onload = img.onerror = done; });
    img.src = `assets/${key}.${ext}`;
    art[key] = img;
    return img.ready;
  }

  function loadTheme(id) {
    if (themeLoads[id]) return themeLoads[id];
    const T = THEMES[id];
    const all = [loadImage(T.ground, 'jpg')]
      .concat((T.textures || []).map((k) => loadImage(k, 'jpg')))
      .concat(T.sprites.concat(COMMON_SPRITES).map((k) => loadImage(k, 'png')));
    return (themeLoads[id] = Promise.all(all).then(() => {
      T.ready = true;
      // re-bake whatever is on the desk now if it was waiting on these
      if (state.track && themeOf(state.track.def) === T) {
        bakeScene(state.track);
        drawMini();
      }
      if (state.screen === 'menu') renderMenu();
    }));
  }

  const loaded = (key) => art[key] && art[key].complete && art[key].naturalWidth > 0;

  let previewed = null;

  function previewTrack(def) {
    if (previewed === def.id) return;
    previewed = def.id;
    loadTheme(def.theme || 'desk');
    const tr = layOut(def);
    bakeScene(tr);
    state.marks = makeLayer();
    drawMini();
  }

  function startRace(trackDef, opts) {
    previewed = null;
    loadTheme(trackDef.theme || 'desk');
    const tr = setupRace(trackDef, opts);
    cam.k = 0; cam.lx = cam.ly = 0; cam.snap = true;   // every race swoops in from the whole desk
    bakeScene(tr);
    state.marks = makeLayer();
    $('#arena').classList.add('racing');
    $('#btn-pause').hidden = false;
    audio.start();
    renderBoard(true);
    updateHud();
    showCount(3);
  }
  try { localStorage.removeItem('paddock-log-v1'); } catch (e) { /* storage blocked */ }   // the old driving log
  // ---------- input ----------


  window.addEventListener('keydown', (e) => {
    if (HELD[e.code]) e.preventDefault();
    if (keys[e.code]) return;
    keys[e.code] = true;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      if (state.screen === 'racing' && !state.paused && state.player) spendSlipstream(state.player);
    }
    if (e.code === 'KeyR' && state.screen === 'racing' && state.player) rescue(state.player);
    if (e.code === 'Escape') togglePause();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });


  // The touch pads write into the same key map the keyboard does, so there is
  // one control path to keep working rather than two.
  for (const pad of document.querySelectorAll('#pads .pad')) {
    const code = pad.dataset.key;
    const down = (e) => {
      e.preventDefault();
      pad.classList.add('is-down');
      if (pad.setPointerCapture && e.pointerId != null) pad.setPointerCapture(e.pointerId);
      if (code === 'ShiftLeft') {
        if (state.screen === 'racing' && !state.paused && state.player) spendSlipstream(state.player);
      } else {
        keys[code] = true;
      }
    };
    const up = (e) => {
      if (e) e.preventDefault();
      pad.classList.remove('is-down');
      keys[code] = false;
    };
    pad.addEventListener('pointerdown', down);
    pad.addEventListener('pointerup', up);
    pad.addEventListener('pointercancel', up);
    pad.addEventListener('contextmenu', (e) => e.preventDefault());
  }


  // a skid mark, into the layer that keeps them for the whole race
  function drawMark(m) {
    const g = state.marks.ctx;
    g.fillStyle = m.wet ? `rgba(${themeOf(state.track.def).wet},${m.a * 0.22})` : `rgba(42,36,32,${m.a})`;
    const c = Math.cos(m.ang), s = Math.sin(m.ang);
    for (const [ox, oy] of [[-11, -9], [-11, 9]]) {
      g.beginPath();
      g.ellipse(m.x + ox * c - oy * s, m.y + ox * s + oy * c, 5.5, 3.4, m.ang, 0, TAU);
      g.fill();
    }
  }
  // ---------- canvas plumbing ----------

  const debug = { show: false };

  const canvas = $('#desk');
  const ctx = canvas.getContext('2d');
  const mini = $('#minimap');
  const mctx = mini.getContext('2d');
  const view = { scale: 1, ox: 0, oy: 0, w: 0, h: 0, dpr: 1, fit: 1, near: 1 };
  // k blends the whole-desk view (0) into the follow view (1)
  const cam = { x: DESK_W / 2, y: DESK_H / 2, lx: 0, ly: 0, k: 0 };

  function fitCanvas() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.dpr = dpr;
    view.w = r.width; view.h = r.height;
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    // Off the grid the whole desk is fitted inside the arena; racing, the
    // camera is close enough that only a stretch of the lap is on screen.
    view.fit = Math.min(r.width / DESK_W, r.height / DESK_H);
    view.near = Math.max(view.fit, Math.sqrt((r.width * r.height) / CAM_AREA));
    placeCamera();
  }

  // Where the camera wants to be this frame: the whole desk, or your car plus
  // a lead in the direction it is travelling.
  function stepCamera(dt) {
    const you = state.player;
    const racing = (state.screen === 'racing' || state.screen === 'done') && you;
    let want = 0;
    if (racing) {
      // swoop in over the countdown, back out once the flag has fallen
      want = state.screen === 'done' ? 0 : 1;
      const rate = 1 / CAM_ZOOM_IN;
      cam.k = want > cam.k ? Math.min(want, cam.k + dt * rate) : Math.max(want, cam.k - dt * rate * 0.6);
      let lx = you.vx * CAM_LEAD_T, ly = you.vy * CAM_LEAD_T;
      const len = Math.hypot(lx, ly);
      if (len > CAM_LEAD_MAX) { lx *= CAM_LEAD_MAX / len; ly *= CAM_LEAD_MAX / len; }
      // the lead eases on its own so a spin does not whip the view round
      const e = 1 - Math.exp(-dt * CAM_FOLLOW * 0.5);
      cam.lx += (lx - cam.lx) * e;
      cam.ly += (ly - cam.ly) * e;
      const f = 1 - Math.exp(-dt * CAM_FOLLOW);
      const tx = you.x + cam.lx, ty = you.y + cam.ly;
      if (dt === 0 || cam.snap) { cam.x = tx; cam.y = ty; cam.snap = false; }
      else { cam.x += (tx - cam.x) * f; cam.y += (ty - cam.y) * f; }
    } else {
      cam.k = 0;
      cam.lx = cam.ly = 0;
      cam.snap = true;
    }
    placeCamera();
  }

  function placeCamera() {
    // ease in and out so the swoop does not start or land with a jolt
    const k = cam.k * cam.k * (3 - 2 * cam.k);
    const scale = view.fit * Math.pow(view.near / view.fit, k);
    view.scale = scale;
    // centre on the car, but never show past the desk's edge once it is
    // bigger than the arena; a desk smaller than the arena stays centred
    const hw = view.w / (2 * scale), hh = view.h / (2 * scale);
    const cx = hw * 2 >= DESK_W ? DESK_W / 2 : clamp(cam.x, hw, DESK_W - hw);
    const cy = hh * 2 >= DESK_H ? DESK_H / 2 : clamp(cam.y, hh, DESK_H - hh);
    const x = DESK_W / 2 + (cx - DESK_W / 2) * k;
    const y = DESK_H / 2 + (cy - DESK_H / 2) * k;
    view.ox = view.w / 2 - x * scale;
    view.oy = view.h / 2 - y * scale;
  }

  function makeLayer() {
    const c = document.createElement('canvas');
    c.width = DESK_W; c.height = DESK_H;
    const g = c.getContext('2d');
    return { canvas: c, ctx: g };
  }

  // ---------- baking the scene ----------

  // Scattered things (sprinkles, stars, glitter) come from a fixed sequence that
  // restarts every bake, so a track looks the same every time it is drawn.
  let seed = 1;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  function bakeScene(tr) {
    const layer = makeLayer();
    const g = layer.ctx;
    const T = themeOf(tr.def);
    seed = 1;

    if (loaded(T.ground)) g.drawImage(art[T.ground], 0, 0, DESK_W, DESK_H);
    else { g.fillStyle = T.base; g.fillRect(0, 0, DESK_W, DESK_H); }

    const props = trackProps(tr.def);
    const byY = (a, b) => a.y - b.y;

    // A few things are what the track is resting *on* — the rule is propped on
    // the floppy stack — so they go down before it.
    props.filter((p) => p.under).sort(byY).forEach((p) => drawProp(g, p));

    drawTrack(g, tr, T);
    for (const pd of state.puddles) drawPuddle(g, pd, T);

    // everything else sits on the desk beside the track, and overlaps its edge
    props.filter((p) => !p.under).sort(byY).forEach((p) => drawProp(g, p));

    drawStartLine(g, tr);
    state.bg = layer;
    state.props = props.filter((p) => p.r);
  }

  function drawProp(g, p) {
    if (p.draw) {
      g.save();
      g.translate(p.x, p.y);
      if (p.rot) g.rotate(p.rot * Math.PI / 180);
      PROP_ART[p.draw](g, p);
      g.restore();
      return;
    }
    const img = art[p.img];
    if (!loaded(p.img)) return;
    const s = (p.s || 1);
    const w = img.width * s, h = img.height * s;
    g.save();
    g.translate(p.x, p.y);
    if (p.rot) g.rotate(p.rot * Math.PI / 180);
    g.drawImage(img, -w / 2, -h / 2, w, h);
    g.restore();
  }

  // Things with no piece on any plate, drawn instead.
  const PROP_ART = {
    // a silver cake board: her foil off the Christmas plate, cut into a disc
    board(g, p) {
      const r = p.size || 150;
      g.fillStyle = 'rgba(40,6,10,0.30)';
      g.beginPath();
      g.arc(7, 10, r, 0, TAU);
      g.fill();
      g.save();
      g.beginPath();
      g.arc(0, 0, r, 0, TAU);
      g.clip();
      if (loaded('christmas/board')) g.drawImage(art['christmas/board'], -r, -r, r * 2, r * 2);
      else { g.fillStyle = '#cfd3d6'; g.fillRect(-r, -r, r * 2, r * 2); }
      g.restore();
      g.lineWidth = 5;
      g.strokeStyle = 'rgba(118,122,128,0.9)';
      g.beginPath();
      g.arc(0, 0, r - 2, 0, TAU);
      g.stroke();
      g.lineWidth = 2.5;
      g.strokeStyle = 'rgba(255,255,255,0.75)';
      g.beginPath();
      g.arc(0, 0, r - 7, Math.PI * 1.02, Math.PI * 1.62);
      g.stroke();
    },
    // a glass bauble, cap and all
    bauble(g, p) {
      const r = p.size || 26, col = p.colour || '#c8202c';
      g.fillStyle = 'rgba(40,6,10,0.32)';
      g.beginPath();
      g.ellipse(5, 8, r, r * 0.9, 0, 0, TAU);
      g.fill();
      const grd = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.08, 0, 0, r);
      grd.addColorStop(0, '#fffaf0');
      grd.addColorStop(0.25, col);
      grd.addColorStop(1, shade(col, -0.45));
      g.fillStyle = grd;
      g.beginPath();
      g.arc(0, 0, r, 0, TAU);
      g.fill();
      g.fillStyle = '#d9b54a';
      g.fillRect(-r * 0.22, -r - 7, r * 0.44, 9);
      g.strokeStyle = '#b08a2a';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(0, -r - 9, 4, 0, TAU);
      g.stroke();
    },
  };

  // lighten (amt > 0) or darken a #rrggbb
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.round(clamp(amt > 0 ? v + (255 - v) * amt : v * (1 + amt), 0, 255));
    return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }

  // A spill is her own painting of one where the theme has it, laid at the
  // size of the patch the physics makes wet; otherwise the drawn coffee stain.
  function drawPuddle(g, pd, T) {
    const pics = T.puddle;
    const key = pics && pics[Math.round(pd.x + pd.y) % pics.length];
    if (key && loaded(key)) {
      const img = art[key];
      const k = pd.r * 2.5 / Math.max(img.width, img.height);
      g.save();
      g.translate(pd.x, pd.y);
      g.rotate(((pd.rot != null ? pd.rot : (pd.x * 7 + pd.y * 3) % 360)) * Math.PI / 180);
      g.drawImage(img, -img.width * k / 2, -img.height * k / 2, img.width * k, img.height * k);
      g.restore();
      return;
    }
    const grd = g.createRadialGradient(pd.x, pd.y, pd.r * 0.15, pd.x, pd.y, pd.r);
    grd.addColorStop(0, 'rgba(58,32,14,0.68)');
    grd.addColorStop(0.7, 'rgba(78,46,20,0.54)');
    grd.addColorStop(1, 'rgba(96,62,30,0)');
    g.save();
    g.beginPath();
    // a wobbly edge, not a circle — it is a spill
    for (let a = 0; a <= TAU + 0.01; a += 0.22) {
      const wob = 1 + Math.sin(a * 3.1 + pd.x) * 0.10 + Math.sin(a * 5.3 + pd.y) * 0.06;
      const x = pd.x + Math.cos(a) * pd.r * wob, y = pd.y + Math.sin(a) * pd.r * wob * 0.82;
      if (a === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
    g.fillStyle = grd;
    g.fill();
    g.clip();
    // a sheen off the top-left, so it reads as wet
    g.fillStyle = 'rgba(190,150,110,0.22)';
    g.beginPath();
    g.ellipse(pd.x - pd.r * 0.3, pd.y - pd.r * 0.3, pd.r * 0.42, pd.r * 0.2, -0.6, 0, TAU);
    g.fill();
    g.restore();
  }

  // --- the track surfaces ---

  function edgePath(g, tr, from, to, side, back) {
    const c = tr.count;
    const n = to - from;
    if (back) {
      for (let i = n; i >= 0; i--) {
        const p = tr.pts[(from + i) % c];
        const x = p.x + p.nx * p.w * side, y = p.y + p.ny * p.w * side;
        g.lineTo(x, y);
      }
    } else {
      for (let i = 0; i <= n; i++) {
        const p = tr.pts[(from + i) % c];
        const x = p.x + p.nx * p.w * side, y = p.y + p.ny * p.w * side;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
    }
  }

  function runShape(g, tr, run, inset) {
    const c = tr.count;
    const n = run.to - run.from;
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const p = tr.pts[(run.from + i) % c];
      const w = p.w - inset;
      const x = p.x + p.nx * w, y = p.y + p.ny * w;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    for (let i = n; i >= 0; i--) {
      const p = tr.pts[(run.from + i) % c];
      const w = p.w - inset;
      g.lineTo(p.x - p.nx * w, p.y - p.ny * w);
    }
    g.closePath();
  }

  function centreLine(g, tr, run, off) {
    const c = tr.count;
    const n = run.to - run.from;
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const p = tr.pts[(run.from + i) % c];
      const x = p.x + p.nx * (off || 0), y = p.y + p.ny * (off || 0);
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
  }

  function drawTrack(g, tr, T) {
    // a soft worn band under the whole lap, so the route always reads
    g.save();
    g.lineCap = T.lane.cap || 'round';
    g.lineJoin = 'round';
    for (const run of tr.runs) {
      centreLine(g, tr, run);
      const w = tr.pts[run.from].w;
      g.strokeStyle = T.lane.band;
      g.lineWidth = w * 2.15;
      g.stroke();
    }
    g.restore();

    for (const run of tr.runs) {
      const fn = RUN_ART[run.surf] || RUN_ART.desk;
      g.save();
      fn(g, tr, run, T);
      g.restore();
    }
  }

  // stroke the run's centreline (or a line `off` to one side of it)
  function strokeRun(g, tr, run, colour, width, off) {
    centreLine(g, tr, run, off);
    g.strokeStyle = colour;
    g.lineWidth = width;
    g.stroke();
  }

  function strokeEdge(g, tr, run, side, colour, width) {
    g.beginPath();
    edgePath(g, tr, run.from, run.to, side, false);
    g.strokeStyle = colour;
    g.lineWidth = width;
    g.stroke();
  }

  // every `n`th sample of a run, with its index
  function eachSample(tr, run, n, fn) {
    for (let i = run.from; i < run.to; i += n) fn(tr.pts[i % tr.count], i);
  }

  // one of her textures as a repeating fill, at `scale`
  function patternOf(g, key, scale) {
    if (!loaded(key)) return null;
    const pat = g.createPattern(art[key], 'repeat');
    if (scale && pat.setTransform) pat.setTransform(new DOMMatrix().scale(scale));
    return pat;
  }

  // a tea-towel gingham, for a theme whose plate has no clean piece of one
  const ginghams = {};
  function gingham(g, colour) {
    if (!ginghams[colour]) {
      const c = document.createElement('canvas');
      c.width = c.height = 36;
      const x = c.getContext('2d');
      x.fillStyle = '#fbf6ee';
      x.fillRect(0, 0, 36, 36);
      x.fillStyle = hexA(colour, 0.5);
      x.fillRect(0, 0, 18, 36);
      x.fillRect(0, 0, 36, 18);
      ginghams[colour] = c;
    }
    return g.createPattern(ginghams[colour], 'repeat');
  }

  function star(g, x, y, r, rot) {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = rot + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
  }

  const RUN_ART = {
    // Bare wood. There is nothing laid down here, so the route has to be read off
    // the desk itself: a lane the toys have polished, chalked at the edges. It
    // needs to be obvious — this is the racing surface, not scenery.
    desk(g, tr, run, T) {
      const w = tr.pts[run.from].w;
      const L = T.lane;
      g.lineCap = L.cap || 'round'; g.lineJoin = 'round';

      centreLine(g, tr, run);
      g.strokeStyle = L.under;
      g.lineWidth = w * 2.1;
      g.stroke();

      // the polished middle, where the wheels actually go
      centreLine(g, tr, run);
      g.strokeStyle = L.polish;
      g.lineWidth = w * 1.5;
      g.stroke();
      centreLine(g, tr, run);
      g.strokeStyle = L.core;
      g.lineWidth = w * 0.7;
      g.stroke();

      // chalk lines along both edges — stitching or a cutting line on some grounds
      if (L.dash) g.setLineDash(L.dash);
      for (const side of [-1, 1]) {
        g.beginPath();
        edgePath(g, tr, run.from, run.to, side, false);
        g.strokeStyle = L.edge;
        g.lineWidth = 3.2;
        g.stroke();
        g.beginPath();
        edgePath(g, tr, run.from, run.to, side * 1.04, false);
        g.strokeStyle = L.shade;
        g.lineWidth = 2;
        g.stroke();
      }
      g.setLineDash([]);
    },

    // the mat the start line is painted on: card on the desk, a towel by the
    // bath, a tea towel in the kitchen
    mat(g, tr, run, T) {
      const w = tr.pts[run.from].w;
      const M = T.mat;
      g.lineCap = 'butt'; g.lineJoin = 'round';
      centreLine(g, tr, run);
      g.strokeStyle = 'rgba(40,28,16,0.26)';
      g.lineWidth = w * 2.16;
      g.stroke();
      const fill = (M.pattern && patternOf(g, M.pattern, M.scale)) || (M.gingham && gingham(g, M.gingham));
      if (fill) {
        runShape(g, tr, run, 0);
        g.fillStyle = fill;
        g.fill();
        if (M.edge) {
          for (const side of [-1, 1]) strokeEdge(g, tr, run, side, M.edge, 3);
        }
        return;
      }
      centreLine(g, tr, run);
      g.strokeStyle = M.fill || '#efe7d6';
      g.lineWidth = w * 2;
      g.stroke();
      centreLine(g, tr, run, -w * 0.55);
      g.strokeStyle = 'rgba(255,255,255,0.45)';
      g.lineWidth = w * 0.5;
      g.stroke();
    },

    tube(g, tr, run, T) {
      (TUBE_ART[T.tube] || TUBE_ART.clear)(g, tr, run, T);
    },

    ruler(g, tr, run, T) {
      (FAST_ART[T.fast] || FAST_ART.rule)(g, tr, run, T);
    },

    // the quick strip propped up into a take-off
    ramp(g, tr, run, T) {
      RUN_ART.ruler(g, tr, run, T);
      const c = tr.count;
      g.save();
      runShape(g, tr, run, 0);
      g.clip();
      const n = run.to - run.from;
      for (let i = 0; i <= n; i++) {
        const p = tr.pts[(run.from + i) % c];
        const t = i / n;
        g.fillStyle = `rgba(255,255,255,${0.10 + t * 0.34})`;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.ang);
        g.fillRect(-4, -p.w, 8, p.w * 2);
        g.restore();
      }
      g.restore();
      // chevrons pointing at the jump
      g.strokeStyle = 'rgba(240,123,53,0.85)';
      g.lineWidth = 3.4;
      for (let i = run.from + 4; i < run.to - 2; i += 9) {
        const p = tr.pts[i % c];
        const w = p.w * 0.72;
        g.beginPath();
        g.moveTo(p.x + p.nx * w - p.tx * 7, p.y + p.ny * w - p.ty * 7);
        g.lineTo(p.x + p.tx * 7, p.y + p.ty * 7);
        g.lineTo(p.x - p.nx * w - p.tx * 7, p.y - p.ny * w - p.ty * 7);
        g.stroke();
      }
    },

    // a boost strip over the bare ground, strewn with whatever this house has
    boost(g, tr, run, T) {
      RUN_ART.desk(g, tr, run, T);
      const kind = T.boost;
      (BOOST_ART[kind] || BOOST_ART.rainbow)(g, tr, run, T);
      if (kind === 'chalk') return;   // its arrows are the chalk
      // arrows over the top
      const c = tr.count;
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.lineWidth = 3.2;
      for (let i = run.from + 3; i < run.to - 2; i += 8) {
        const p = tr.pts[i % c];
        const ww = p.w * 0.6;
        g.beginPath();
        g.moveTo(p.x + p.nx * ww - p.tx * 8, p.y + p.ny * ww - p.ty * 8);
        g.lineTo(p.x + p.tx * 8, p.y + p.ty * 8);
        g.lineTo(p.x - p.nx * ww - p.tx * 8, p.y - p.ny * ww - p.ty * 8);
        g.stroke();
      }
    },
  };

  // --- the walled track, per theme ---
  const TUBE_ART = {
    // clear plastic tubing: a pale channel with two bright rims
    clear(g, tr, run) {
      const w = tr.pts[run.from].w;
      g.lineCap = 'round'; g.lineJoin = 'round';

      centreLine(g, tr, run);
      g.strokeStyle = 'rgba(40,52,64,0.22)';
      g.lineWidth = w * 2.3;
      g.stroke();

      centreLine(g, tr, run);
      g.strokeStyle = 'rgba(226,238,246,0.60)';
      g.lineWidth = w * 2;
      g.stroke();

      centreLine(g, tr, run);
      g.strokeStyle = 'rgba(178,204,222,0.45)';
      g.lineWidth = w * 1.45;
      g.stroke();

      // the walls
      for (const side of [-1, 1]) {
        g.beginPath();
        edgePath(g, tr, run.from, run.to, side, false);
        g.strokeStyle = 'rgba(250,253,255,0.88)';
        g.lineWidth = 5.5;
        g.stroke();
        g.beginPath();
        edgePath(g, tr, run.from, run.to, side * 0.86, false);
        g.strokeStyle = 'rgba(126,158,180,0.35)';
        g.lineWidth = 2;
        g.stroke();
      }
      // the long highlight down the inside of the tube
      centreLine(g, tr, run, -w * 0.42);
      g.strokeStyle = 'rgba(255,255,255,0.55)';
      g.lineWidth = w * 0.22;
      g.stroke();
    },

    // the shower hose, split down its length: a ribbed steel wall each side
    hose(g, tr, run) {
      const w = tr.pts[run.from].w;
      g.lineCap = 'butt'; g.lineJoin = 'round';
      strokeRun(g, tr, run, 'rgba(30,50,70,0.20)', w * 2.3);
      strokeRun(g, tr, run, 'rgba(214,226,236,0.72)', w * 2);
      strokeRun(g, tr, run, 'rgba(255,255,255,0.35)', w * 1.2);
      for (const side of [-1, 1]) {
        strokeEdge(g, tr, run, side, '#7d8a96', 12);
        strokeEdge(g, tr, run, side * 0.985, '#c6d0d8', 5);
        g.strokeStyle = 'rgba(64,76,88,0.6)';
        g.lineWidth = 1.6;
        eachSample(tr, run, 1, (p) => {
          const a = p.w * side * 0.93, b = p.w * side * 1.07;
          g.beginPath();
          g.moveTo(p.x + p.nx * a, p.y + p.ny * a);
          g.lineTo(p.x + p.nx * b, p.y + p.ny * b);
          g.stroke();
        });
      }
    },

    // a wooden train track: two grooves, raised sides and a jigsaw joint
    wood(g, tr, run) {
      const w = tr.pts[run.from].w;
      g.lineCap = 'butt'; g.lineJoin = 'round';
      strokeRun(g, tr, run, 'rgba(60,34,14,0.30)', w * 2.3);
      strokeRun(g, tr, run, '#d29c5c', w * 2.06);
      strokeRun(g, tr, run, '#e6b77a', w * 1.5);
      for (const off of [-0.42, 0.42]) {
        strokeRun(g, tr, run, '#9a6430', w * 0.17, w * off);
        strokeRun(g, tr, run, 'rgba(255,232,196,0.45)', 2, w * (off - 0.1));
      }
      for (const side of [-1, 1]) strokeEdge(g, tr, run, side, '#7a4a22', 3.2);
      // a joint every couple of car lengths, with its peg
      const every = Math.max(8, Math.round(150 / tr.step));
      g.strokeStyle = '#7a4a22';
      g.lineWidth = 2.4;
      eachSample(tr, run, every, (p, i) => {
        if (i === run.from) return;
        g.beginPath();
        g.moveTo(p.x + p.nx * p.w, p.y + p.ny * p.w);
        g.lineTo(p.x - p.nx * p.w, p.y - p.ny * p.w);
        g.stroke();
        g.beginPath();
        g.arc(p.x + p.tx * 7, p.y + p.ty * 7, p.w * 0.13, 0, TAU);
        g.stroke();
      });
    },

    // galvanised guttering: a grey channel with rolled rims and its joins
    pipe(g, tr, run) {
      const w = tr.pts[run.from].w;
      g.lineCap = 'butt'; g.lineJoin = 'round';
      strokeRun(g, tr, run, 'rgba(30,26,20,0.32)', w * 2.32);
      strokeRun(g, tr, run, '#878f95', w * 2.06);
      strokeRun(g, tr, run, '#a7afb5', w * 1.55);
      strokeRun(g, tr, run, 'rgba(255,255,255,0.32)', w * 0.3, -w * 0.3);
      for (const side of [-1, 1]) {
        strokeEdge(g, tr, run, side, '#596167', 9);
        strokeEdge(g, tr, run, side * 0.985, '#cfd5d9', 3);
      }
      const every = Math.max(10, Math.round(210 / tr.step));
      eachSample(tr, run, every, (p, i) => {
        if (i === run.from) return;
        for (const [col, wd, o] of [['#6d757b', 7, 0], ['rgba(230,234,236,0.7)', 2, -4]]) {
          g.strokeStyle = col;
          g.lineWidth = wd;
          g.beginPath();
          g.moveTo(p.x + p.nx * p.w + p.tx * o, p.y + p.ny * p.w + p.ty * o);
          g.lineTo(p.x - p.nx * p.w + p.tx * o, p.y - p.ny * p.w + p.ty * o);
          g.stroke();
        }
      });
    },

    // a paper chain laid along each side, the links in turn
    chain(g, tr, run) {
      const w = tr.pts[run.from].w;
      const cols = ['#d9342b', '#2f9a4a', '#f2c230', '#2d8fd5', '#ee7d2b'];
      g.lineCap = 'butt'; g.lineJoin = 'round';
      strokeRun(g, tr, run, 'rgba(60,6,10,0.18)', w * 2.2);
      strokeRun(g, tr, run, 'rgba(255,236,214,0.20)', w * 2);
      for (const side of [-1, 1]) {
        eachSample(tr, run, 2, (p, i) => {
          const x = p.x + p.nx * p.w * side, y = p.y + p.ny * p.w * side;
          const col = cols[((i >> 1) + (side > 0 ? 2 : 0)) % cols.length];
          g.save();
          g.translate(x, y);
          g.rotate(p.ang);
          if ((i >> 1) % 2) {
            // a link seen side on, threaded through its neighbours
            g.fillStyle = shade(col, -0.25);
            roundRect(g, -9, -3, 18, 6, 3);
            g.fill();
          } else {
            g.strokeStyle = shade(col, -0.35);
            g.lineWidth = 5.4;
            g.beginPath();
            g.ellipse(0, 0, 9.5, 6.5, 0, 0, TAU);
            g.stroke();
            g.strokeStyle = col;
            g.lineWidth = 3.4;
            g.stroke();
          }
          g.restore();
        });
      }
    },

    // a strip of corrugated card stood on edge each side, the flutes showing
    card(g, tr, run) {
      const w = tr.pts[run.from].w;
      g.lineCap = 'butt'; g.lineJoin = 'round';
      strokeRun(g, tr, run, 'rgba(20,30,20,0.30)', w * 2.32);
      strokeRun(g, tr, run, '#c99d66', w * 2.04);
      for (const off of [-0.6, -0.3, 0, 0.3, 0.6]) strokeRun(g, tr, run, 'rgba(150,108,62,0.30)', 2, w * off);
      for (const side of [-1, 1]) {
        strokeEdge(g, tr, run, side, '#a87a46', 13);
        g.lineWidth = 2;
        eachSample(tr, run, 1, (p, i) => {
          g.strokeStyle = i % 2 ? 'rgba(110,76,40,0.75)' : 'rgba(236,200,150,0.6)';
          const a = p.w * side * 0.92, b = p.w * side * 1.08;
          g.beginPath();
          g.moveTo(p.x + p.nx * a, p.y + p.ny * a);
          g.lineTo(p.x + p.nx * b, p.y + p.ny * b);
          g.stroke();
        });
        strokeEdge(g, tr, run, side * 1.09, '#6e4c26', 2);
        strokeEdge(g, tr, run, side * 0.91, '#6e4c26', 1.5);
      }
    },

    // bendy straws end to end, ribbed where they bend
    straw(g, tr, run) {
      const w = tr.pts[run.from].w;
      g.lineCap = 'butt'; g.lineJoin = 'round';
      strokeRun(g, tr, run, 'rgba(60,70,80,0.16)', w * 2.32);
      strokeRun(g, tr, run, 'rgba(255,255,255,0.42)', w * 2);
      for (const side of [-1, 1]) {
        strokeEdge(g, tr, run, side, '#2f8fd0', 13);
        strokeEdge(g, tr, run, side, '#5fb6ec', 7);
        strokeEdge(g, tr, run, side * 0.985, 'rgba(255,255,255,0.8)', 2);
        g.strokeStyle = 'rgba(20,80,130,0.55)';
        g.lineWidth = 1.6;
        eachSample(tr, run, 1, (p) => {
          if (p.k < 0.0035) return;
          const a = p.w * side * 0.93, b = p.w * side * 1.07;
          g.beginPath();
          g.moveTo(p.x + p.nx * a, p.y + p.ny * a);
          g.lineTo(p.x + p.nx * b, p.y + p.ny * b);
          g.stroke();
        });
      }
    },
  };

  // --- the quick strip, per theme ---
  const FAST_ART = {
    // the steel rule: brushed metal with its markings
    rule(g, tr, run) {
      const w = tr.pts[run.from].w;
      g.lineCap = 'butt'; g.lineJoin = 'round';

      centreLine(g, tr, run);
      g.strokeStyle = 'rgba(30,36,44,0.30)';
      g.lineWidth = w * 2.2;
      g.stroke();

      centreLine(g, tr, run);
      g.strokeStyle = '#b9bfc6';
      g.lineWidth = w * 2;
      g.stroke();

      centreLine(g, tr, run, -w * 0.4);
      g.strokeStyle = 'rgba(255,255,255,0.55)';
      g.lineWidth = w * 0.5;
      g.stroke();

      centreLine(g, tr, run, w * 0.55);
      g.strokeStyle = 'rgba(120,130,142,0.5)';
      g.lineWidth = w * 0.4;
      g.stroke();

      // tick marks along the far edge
      const c = tr.count;
      g.strokeStyle = 'rgba(52,60,70,0.7)';
      for (let i = run.from; i < run.to; i += 2) {
        const p = tr.pts[i % c];
        const big = (i % 10 === 0);
        const len = big ? w * 0.52 : w * 0.3;
        g.lineWidth = big ? 1.8 : 1.1;
        g.beginPath();
        g.moveTo(p.x + p.nx * w * 0.96, p.y + p.ny * w * 0.96);
        g.lineTo(p.x + p.nx * (w * 0.96 - len), p.y + p.ny * (w * 0.96 - len));
        g.stroke();
      }
      for (const side of [-1, 1]) {
        g.beginPath();
        edgePath(g, tr, run.from, run.to, side, false);
        g.strokeStyle = 'rgba(236,240,244,0.8)';
        g.lineWidth = 2.4;
        g.stroke();
      }
    },

    // the chrome towel rail laid flat: polished, blue in its reflections
    chrome(g, tr, run) {
      const w = tr.pts[run.from].w;
      g.lineCap = 'butt'; g.lineJoin = 'round';
      strokeRun(g, tr, run, 'rgba(30,40,54,0.30)', w * 2.2);
      strokeRun(g, tr, run, '#b7c8d7', w * 2);
      strokeRun(g, tr, run, '#91a6b9', w * 0.9, w * 0.52);
      strokeRun(g, tr, run, 'rgba(255,255,255,0.8)', w * 0.34, -w * 0.46);
      strokeRun(g, tr, run, 'rgba(236,246,255,0.5)', w * 0.16, -w * 0.08);
      for (const side of [-1, 1]) strokeEdge(g, tr, run, side, '#6f8496', 2.6);
    },

    // a polished pine plank, grain and all
    plank(g, tr, run) {
      const w = tr.pts[run.from].w;
      g.lineCap = 'butt'; g.lineJoin = 'round';
      strokeRun(g, tr, run, 'rgba(50,30,12,0.30)', w * 2.2);
      strokeRun(g, tr, run, '#deb075', w * 2);
      for (const off of [-0.72, -0.36, 0.06, 0.41, 0.74]) strokeRun(g, tr, run, 'rgba(150,96,44,0.32)', 1.4, w * off);
      strokeRun(g, tr, run, 'rgba(255,242,214,0.42)', w * 0.3, -w * 0.4);
      for (const side of [-1, 1]) strokeEdge(g, tr, run, side, '#8a5a2b', 3);
    },

    // a roofing slate, chalk-edged
    slate(g, tr, run) {
      const w = tr.pts[run.from].w;
      g.lineCap = 'butt'; g.lineJoin = 'round';
      strokeRun(g, tr, run, 'rgba(20,20,24,0.34)', w * 2.24);
      runShape(g, tr, run, 0);
      g.fillStyle = patternOf(g, 'bench/slate', 0.8) || '#4b5560';
      g.fill();
      for (const side of [-1, 1]) strokeEdge(g, tr, run, side, '#283038', 3);
      g.setLineDash([12, 10]);
      for (const side of [-1, 1]) strokeEdge(g, tr, run, side * 0.88, 'rgba(240,240,232,0.55)', 2.2);
      g.setLineDash([]);
    },

    // a strip of silver foil, crinkled
    foil(g, tr, run) {
      const w = tr.pts[run.from].w;
      g.lineCap = 'butt'; g.lineJoin = 'round';
      strokeRun(g, tr, run, 'rgba(50,6,10,0.32)', w * 2.2);
      strokeRun(g, tr, run, '#cfd3d7', w * 2);
      strokeRun(g, tr, run, 'rgba(255,255,255,0.55)', w * 0.4, -w * 0.42);
      g.save();
      runShape(g, tr, run, 0);
      g.clip();
      eachSample(tr, run, 1, (p) => {
        for (let k = 0; k < 2; k++) {
          const o = (rnd() - 0.5) * 1.8 * p.w, a = rnd() * TAU, l = 6 + rnd() * 14;
          const x = p.x + p.nx * o, y = p.y + p.ny * o;
          g.strokeStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.7)' : 'rgba(110,116,124,0.35)';
          g.lineWidth = 1.2;
          g.beginPath();
          g.moveTo(x - Math.cos(a) * l / 2, y - Math.sin(a) * l / 2);
          g.lineTo(x + Math.cos(a) * l / 2, y + Math.sin(a) * l / 2);
          g.stroke();
        }
      });
      g.restore();
      for (const side of [-1, 1]) strokeEdge(g, tr, run, side, '#8a9096', 2.6);
    },

    // a baking tray: dark sheet steel with a rolled rim, and last week's baking
    tray(g, tr, run) {
      const w = tr.pts[run.from].w;
      g.lineCap = 'butt'; g.lineJoin = 'round';
      strokeRun(g, tr, run, 'rgba(40,40,44,0.30)', w * 2.24);
      strokeRun(g, tr, run, '#878e95', w * 2);
      strokeRun(g, tr, run, '#9ba2a8', w * 1.5);
      strokeRun(g, tr, run, 'rgba(255,255,255,0.28)', w * 0.3, -w * 0.38);
      g.save();
      runShape(g, tr, run, 0);
      g.clip();
      eachSample(tr, run, 3, (p) => {
        const o = (rnd() - 0.5) * 1.6 * p.w;
        g.fillStyle = `rgba(120,80,40,${0.10 + rnd() * 0.16})`;
        g.beginPath();
        g.arc(p.x + p.nx * o, p.y + p.ny * o, 2 + rnd() * 5, 0, TAU);
        g.fill();
      });
      g.restore();
      for (const side of [-1, 1]) {
        strokeEdge(g, tr, run, side, '#d3d8dc', 8);
        strokeEdge(g, tr, run, side * 1.05, '#5f666c', 2);
      }
    },
  };

  // --- what the boost strip is strewn with, per theme ---
  const BOOST_ART = {
    // the rainbow smear off the desk plate
    rainbow(g, tr, run) {
      const bands = ['#e8483a', '#f09a2e', '#f2cf3c', '#65bb53', '#3f8fd0', '#8b5fc6'];
      const w = tr.pts[run.from].w;
      g.lineCap = 'butt';
      bands.forEach((col, bi) => {
        const off = (bi - (bands.length - 1) / 2) * (w * 1.7 / bands.length);
        centreLine(g, tr, run, off);
        g.strokeStyle = col;
        g.globalAlpha = 0.5;
        g.lineWidth = w * 1.7 / bands.length + 1;
        g.stroke();
      });
      g.globalAlpha = 1;
    },

    // her bubbles, blown along the strip
    bubbles(g, tr, run) {
      const key = 'bath/bubbles-b';
      let n = 0;
      eachSample(tr, run, 5, (p) => {
        const o = (n++ % 2 ? 0.42 : -0.42) * p.w + (rnd() - 0.5) * 12;
        const x = p.x + p.nx * o, y = p.y + p.ny * o;
        if (loaded(key)) {
          const img = art[key], k = 0.3;
          g.save();
          g.translate(x, y);
          g.rotate(p.ang + (rnd() - 0.5) * 0.8);
          g.drawImage(img, -img.width * k / 2, -img.height * k / 2, img.width * k, img.height * k);
          g.restore();
        } else {
          g.strokeStyle = 'rgba(160,190,240,0.8)';
          g.lineWidth = 2;
          g.beginPath();
          g.arc(x, y, 9, 0, TAU);
          g.stroke();
        }
      });
    },

    // a trail of glow-in-the-dark stars
    stars(g, tr, run) {
      g.save();
      g.shadowColor = 'rgba(255,232,120,0.9)';
      g.shadowBlur = 10;
      eachSample(tr, run, 2, (p) => {
        const o = (rnd() - 0.5) * 1.6 * p.w;
        g.fillStyle = rnd() < 0.75 ? '#ffe57a' : '#fff6d6';
        star(g, p.x + p.nx * o, p.y + p.ny * o, 6 + rnd() * 7, rnd() * TAU);
        g.fill();
      });
      g.restore();
    },

    // the strip chalked on to a slate, arrows and all
    chalk(g, tr, run) {
      runShape(g, tr, run, 0);
      g.fillStyle = patternOf(g, 'bench/slate', 0.8) || '#4b5560';
      g.fill();
      for (const side of [-1, 1]) strokeEdge(g, tr, run, side, '#283038', 3);
      const c = tr.count;
      g.lineCap = 'round';
      for (let i = run.from + 3; i < run.to - 2; i += 9) {
        const p = tr.pts[i % c];
        const ww = p.w * 0.62;
        // two shaky passes, the way chalk goes on
        for (let k = 0; k < 2; k++) {
          const j = () => (rnd() - 0.5) * 3;
          g.strokeStyle = `rgba(244,244,236,${k ? 0.5 : 0.85})`;
          g.lineWidth = k ? 2 : 4;
          g.beginPath();
          g.moveTo(p.x + p.nx * ww - p.tx * 10 + j(), p.y + p.ny * ww - p.ty * 10 + j());
          g.lineTo(p.x + p.tx * 10 + j(), p.y + p.ty * 10 + j());
          g.lineTo(p.x - p.nx * ww - p.tx * 10 + j(), p.y - p.ny * ww - p.ty * 10 + j());
          g.stroke();
        }
      }
    },

    // tinsel down both sides, gold dust between
    tinsel(g, tr, run) {
      const key = 'christmas/tinsel';
      const every = Math.max(4, Math.round(90 / tr.step));
      for (const side of [-1, 1]) {
        eachSample(tr, run, every, (p) => {
          if (!loaded(key)) return;
          const img = art[key], k = 0.42;
          g.save();
          g.translate(p.x + p.nx * p.w * side * 0.86, p.y + p.ny * p.w * side * 0.86);
          g.rotate(p.ang);
          g.drawImage(img, -img.width * k / 2, -img.height * k / 2, img.width * k, img.height * k);
          g.restore();
        });
      }
      eachSample(tr, run, 1, (p) => {
        for (let k = 0; k < 3; k++) {
          const o = (rnd() - 0.5) * 1.4 * p.w;
          g.fillStyle = rnd() < 0.6 ? 'rgba(242,200,80,0.85)' : 'rgba(255,246,210,0.9)';
          g.beginPath();
          g.arc(p.x + p.nx * o + (rnd() - 0.5) * 6, p.y + p.ny * o + (rnd() - 0.5) * 6, 1 + rnd() * 1.8, 0, TAU);
          g.fill();
        }
      });
    },

    // a spill of glitter
    glitter(g, tr, run) {
      const cols = ['#ffffff', '#e8eef2', '#f0cf6a', '#c9d2da', '#ffe9a8'];
      eachSample(tr, run, 1, (p) => {
        for (let k = 0; k < 7; k++) {
          const o = (rnd() - 0.5) * 1.7 * p.w * (0.5 + rnd() * 0.5);
          g.fillStyle = cols[Math.floor(rnd() * cols.length)];
          g.globalAlpha = 0.55 + rnd() * 0.45;
          g.beginPath();
          g.arc(p.x + p.nx * o + (rnd() - 0.5) * 7, p.y + p.ny * o + (rnd() - 0.5) * 7, 0.8 + rnd() * 2, 0, TAU);
          g.fill();
        }
      });
      g.globalAlpha = 1;
    },

    // hundreds and thousands
    sprinkles(g, tr, run) {
      const cols = ['#f2668b', '#f7c948', '#59b7ef', '#7fcf6a', '#f39a4a', '#fdfaf2', '#b98ee8'];
      eachSample(tr, run, 1, (p) => {
        for (let k = 0; k < 3; k++) {
          const o = (rnd() - 0.5) * 1.7 * p.w;
          g.save();
          g.translate(p.x + p.nx * o + (rnd() - 0.5) * 7, p.y + p.ny * o + (rnd() - 0.5) * 7);
          g.rotate(rnd() * TAU);
          g.fillStyle = cols[Math.floor(rnd() * cols.length)];
          roundRect(g, -5, -1.6, 10, 3.2, 1.6);
          g.fill();
          g.restore();
        }
      });
    },
  };

  function drawStartLine(g, tr) {
    const p = tr.pts[0];
    g.save();
    g.translate(p.x, p.y);
    g.rotate(p.ang);
    const w = p.w;
    // two rows of chequer across the track
    for (let r = 0; r < 2; r++) {
      for (let i = -Math.ceil(w / 11); i <= Math.ceil(w / 11); i++) {
        g.fillStyle = ((i + r) % 2) ? '#f4f1ea' : '#26262a';
        g.fillRect(r * 11 - 11, i * 11 - 5.5, 11, 11);
      }
    }
    g.restore();
    // her flags planted either side of it, far enough out to clear the cars on
    // the grid. They are drawn from the foot of the pole, not the middle.
    const stand = (img, at, s) => {
      if (!img || !img.width) return;
      g.save();
      g.translate(p.x + p.nx * at, p.y + p.ny * at);
      g.drawImage(img, -img.width * s / 2, -img.height * s * 0.86, img.width * s, img.height * s);
      g.restore();
    };
    stand(art.flag, p.w + 30, 0.58);
    stand(art.flags, -(p.w + 42), 0.58);
  }

  // ---------- drawing a car ----------

  function drawCar(g, car, t) {
    const col = COLOURS[car.colour] || COLOURS.red;
    const lift = 1 + car.z * 0.0042;
    const L = CAR_LEN * lift, W = CAR_WID * lift;

    // shadow — further out and softer the higher the car is
    g.save();
    g.translate(car.x + 4 + car.z * 0.11, car.y + 7 + car.z * 0.16);
    g.rotate(car.ang);
    g.fillStyle = `rgba(28,20,12,${clamp(0.34 - car.z * 0.0011, 0.08, 0.34)})`;
    roundRect(g, -L / 2, -W / 2, L, W, 8);
    g.fill();
    g.restore();

    g.save();
    g.translate(car.x, car.y);
    g.rotate(car.ang);
    g.scale(lift, lift);

    // wheels first, so the body overlaps them
    const steerVis = car.steer * 0.45;
    g.fillStyle = '#25262a';
    for (const [ox, oy, turn] of [[13, -13, 1], [13, 13, 1], [-13, -13, 0], [-13, 13, 0]]) {
      g.save();
      g.translate(ox, oy);
      if (turn) g.rotate(steerVis);
      roundRect(g, -7.5, -3.6, 15, 7.2, 2.6);
      g.fill();
      g.restore();
    }

    // body
    const body = g.createLinearGradient(0, -CAR_WID / 2, 0, CAR_WID / 2);
    body.addColorStop(0, col.light);
    body.addColorStop(0.45, col.body);
    body.addColorStop(1, col.dark);
    g.fillStyle = body;
    carShell(g);
    g.fill();
    g.strokeStyle = 'rgba(20,14,10,0.55)';
    g.lineWidth = 1.6;
    g.stroke();

    // a stripe down the middle, because they all have one
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.fillRect(-CAR_LEN / 2 + 5, -2.4, CAR_LEN - 12, 4.8);

    // cabin
    g.fillStyle = 'rgba(28,38,52,0.85)';
    roundRect(g, -8, -8.5, 17, 17, 5);
    g.fill();
    g.fillStyle = 'rgba(150,200,235,0.75)';
    roundRect(g, 3, -7.5, 5.5, 15, 2.5);
    g.fill();

    // lights
    g.fillStyle = '#fff3cf';
    roundRect(g, CAR_LEN / 2 - 5.5, -9.5, 3.4, 4.4, 1.4);
    g.fill();
    roundRect(g, CAR_LEN / 2 - 5.5, 5.1, 3.4, 4.4, 1.4);
    g.fill();
    g.fillStyle = car.brake > 0.1 ? '#ff5540' : '#a8342a';
    roundRect(g, -CAR_LEN / 2 + 1.6, -9, 2.6, 4, 1.2);
    g.fill();
    roundRect(g, -CAR_LEN / 2 + 1.6, 5, 2.6, 4, 1.2);
    g.fill();

    // gloss
    g.fillStyle = 'rgba(255,255,255,0.20)';
    g.beginPath();
    g.ellipse(2, -8, 15, 3.6, 0, 0, TAU);
    g.fill();

    g.restore();

    // the tow, and what you do with it
    if (car.boost > 0) {
      const a = clamp(car.boost / BOOST_TIME, 0, 1);
      g.save();
      g.translate(car.x, car.y);
      g.rotate(car.ang);
      const fl = g.createLinearGradient(-22, 0, -76, 0);
      fl.addColorStop(0, hexA(col.trail, 0.75 * a));
      fl.addColorStop(1, hexA(col.trail, 0));
      g.fillStyle = fl;
      g.beginPath();
      g.moveTo(-22, -9);
      g.lineTo(-30 - 46 * a, -3 + Math.sin(t * 40) * 2);
      g.lineTo(-30 - 46 * a, 3 + Math.sin(t * 37) * 2);
      g.lineTo(-22, 9);
      g.closePath();
      g.fill();
      g.restore();
    } else if (car.tow > 0.15) {
      g.save();
      g.globalAlpha = car.tow * 0.35;
      g.strokeStyle = '#bfe8ff';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(car.x, car.y);
      g.lineTo(car.x - Math.cos(car.ang) * 26, car.y - Math.sin(car.ang) * 26);
      g.stroke();
      g.restore();
    }

    // a ring under the player's car so it is never lost in the clutter
    if (car.isPlayer) {
      g.save();
      g.strokeStyle = 'rgba(255,255,255,0.5)';
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(car.x, car.y + 12, 22, 9, 0, 0, TAU);
      g.stroke();
      g.restore();
    }
  }

  function carShell(g) {
    const L = CAR_LEN / 2, W = CAR_WID / 2;
    g.beginPath();
    g.moveTo(L - 3, -W + 2);
    g.quadraticCurveTo(L, -W + 1, L, -W + 5);
    g.lineTo(L, W - 5);
    g.quadraticCurveTo(L, W - 1, L - 3, W - 2);
    g.lineTo(-L + 4, W);
    g.quadraticCurveTo(-L, W, -L, W - 4);
    g.lineTo(-L, -W + 4);
    g.quadraticCurveTo(-L, -W, -L + 4, -W);
    g.closePath();
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // ---------- the frame ----------

  function draw(t) {
    const g = ctx;
    g.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    g.clearRect(0, 0, view.w, view.h);

    // The camera follows smoothly and never shakes. Shaking the whole desk on a
    // bump was tried and it reads as a rendering glitch rather than an impact —
    // the feedback belongs on the car: sparks, dust and a thud.
    g.save();
    g.translate(view.ox, view.oy);
    g.scale(view.scale, view.scale);

    if (state.bg) g.drawImage(state.bg.canvas, 0, 0);
    if (state.marks) g.drawImage(state.marks.canvas, 0, 0);

    // puffs of dust under the cars
    for (const f of state.fx) {
      if (f.kind === 'spark') continue;
      const a = 1 - f.t / f.life;
      g.globalAlpha = a * (f.kind === 'smoke' ? 0.34 : 0.5);
      g.fillStyle = f.colour;
      g.beginPath();
      g.arc(f.x, f.y, f.r * (1 + (1 - a) * 0.8), 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;

    const cars = state.cars.slice().sort((a, b) => (a.z - b.z) || (a.y - b.y));
    for (const car of cars) drawCar(g, car, t);

    for (const f of state.fx) {
      if (f.kind !== 'spark') continue;
      g.globalAlpha = 1 - f.t / f.life;
      g.fillStyle = f.colour;
      g.beginPath();
      g.arc(f.x, f.y, f.r, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;

    // Laying props out beside a track by typing coordinates is guesswork, so
    // there is a switch that draws what the physics actually sees.
    if (debug.show && state.track) {
      const tr = state.track;
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(255,60,60,0.75)';
      for (const p of state.props) {
        g.beginPath();
        g.arc(p.x, p.y, p.r, 0, TAU);
        g.stroke();
      }
      g.strokeStyle = 'rgba(80,255,120,0.8)';
      for (const side of [-1, 1]) {
        g.beginPath();
        for (let i = 0; i <= tr.count; i++) {
          const p = tr.pts[i % tr.count];
          const x = p.x + p.nx * p.w * side, y = p.y + p.ny * p.w * side;
          if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.stroke();
      }
    }

    // a caret over each rival so the standings can be read on the desk too
    for (const car of state.cars) {
      if (car.isPlayer) continue;
      g.fillStyle = hexA(COLOURS[car.colour].body, 0.9);
      g.beginPath();
      g.moveTo(car.x, car.y - 26 - car.z * 0.12);
      g.lineTo(car.x - 5, car.y - 34 - car.z * 0.12);
      g.lineTo(car.x + 5, car.y - 34 - car.z * 0.12);
      g.closePath();
      g.fill();
    }

    g.restore();

    // Zoomed in, the desk is no longer the map. Where the layout has no room
    // for the panel's map (a phone held sideways) it goes in the desk's corner.
    if (cam.k > 0.5 && state.track && mini.offsetParent === null) {
      const w = Math.min(170, view.w * 0.3), h = w * mini.height / mini.width;
      const x = view.w - w - 10, y = 10;
      g.globalAlpha = Math.min(1, (cam.k - 0.5) * 4);
      g.fillStyle = 'rgba(20, 16, 24, 0.62)';
      roundRect(g, x, y, w, h, 8);
      g.fill();
      g.drawImage(mini, x, y, w, h);
      g.globalAlpha = 1;
    }
  }

  function drawMini() {
    const tr = state.track;
    if (!tr) return;
    const W = mini.width, H = mini.height;
    mctx.clearRect(0, 0, W, H);
    const pad = 12;
    const s = Math.min((W - pad * 2) / DESK_W, (H - pad * 2) / DESK_H);
    const ox = (W - DESK_W * s) / 2, oy = (H - DESK_H * s) / 2;

    mctx.save();
    mctx.translate(ox, oy);
    mctx.scale(s, s);

    mctx.lineCap = 'round';
    mctx.lineJoin = 'round';
    for (const run of tr.runs) {
      centreLine(mctx, tr, run);
      mctx.strokeStyle = MINI_COL[run.surf] || '#8f9aa8';
      mctx.lineWidth = 44;   // world units, so it reads at the map's scale
      mctx.stroke();
    }
    mctx.restore();

    for (const car of state.cars) {
      const x = ox + car.x * s, y = oy + car.y * s;
      mctx.fillStyle = COLOURS[car.colour].body;
      mctx.beginPath();
      mctx.arc(x, y, car.isPlayer ? 5.2 : 3.6, 0, TAU);
      mctx.fill();
      if (car.isPlayer) {
        mctx.strokeStyle = '#fff';
        mctx.lineWidth = 1.6;
        mctx.stroke();
      }
    }
  }

  const MINI_COL = {
    tube: 'rgba(226,240,250,0.92)',
    ruler: 'rgba(196,204,212,0.9)',
    ramp: 'rgba(240,160,90,0.9)',
    boost: 'rgba(240,200,90,0.9)',
    mat: 'rgba(255,255,255,0.95)',
    desk: 'rgba(168,140,108,0.85)',
  };

  // ---------- HUD ----------

  const hud = {
    lap: $('#hud-lap'), time: $('#hud-time'), pos: $('#hud-pos'),
    best: $('#hud-best'), slip: $('#hud-slip-fill'), slipBox: document.querySelector('.meter-slip'),
    board: $('#board'),
  };

  let boardRows = [];

  function renderBoard(rebuild) {
    const list = standings();
    if (rebuild || boardRows.length !== list.length) {
      hud.board.innerHTML = '';
      boardRows = state.cars.map(() => {
        const li = document.createElement('li');
        li.innerHTML = '<span class="rank"></span><span class="chip"></span><span class="who"></span><span class="gap"></span>';
        hud.board.appendChild(li);
        return li;
      });
    }
    const leader = list[0];
    const pace = list.find((c) => !c.done);
    list.forEach((car, i) => {
      const li = boardRows[i];
      li.className = car.isPlayer ? 'is-you' : (car.done ? 'is-out' : '');
      li.children[0].textContent = i + 1;
      li.children[1].style.background = COLOURS[car.colour].body;
      li.children[2].textContent = car.isPlayer ? `You — ${car.colour}` : car.name;
      // Once the leader has taken the flag its progress stops, and the cars
      // still circulating sail past it — measuring against it then gives a
      // negative gap. So the reference is the leading car still running.
      let gap = '';
      if (car.done) gap = fmtTime(car.doneAt);
      else if (i === 0) gap = ordinal(1);
      else if (car === pace) gap = 'running';
      else gap = gapText((pace || leader).prog - car.prog);
      li.children[3].textContent = gap;
    });
  }

  function updateHud() {
    const you = state.player;
    const tr = state.track;
    if (!you || !tr) return;
    hud.lap.textContent = `${clamp(you.lap || 1, 1, state.laps)}/${state.laps}`;
    // once you are across the line the clock should show the race, not a lap
    // that will never be finished
    hud.time.textContent = fmtTime(you.done ? you.doneAt
      : state.countdown > 0 ? 0 : state.time - you.lapStart);
    hud.pos.textContent = ordinal(you.pos);
    const rec = save.best[tr.id];
    hud.best.textContent = rec ? fmtTime(rec) : 'best —';
    hud.slip.style.width = `${you.slipstream * 100}%`;
    hud.slipBox.classList.toggle('is-ready', you.slipstream >= 0.25);
  }

  function flashBest() {
    const el = $('.meter-best');
    el.animate([{ filter: 'brightness(2.2)' }, { filter: 'brightness(1)' }], { duration: 600 });
  }

  // ---------- race flow ----------

  let last = 0, acc = 0, hudT = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    const t = now / 1000;
    let dt = last ? Math.min(t - last, MAX_FRAME) : 0;
    last = t;

    if (state.screen === 'racing' && !state.paused) {
      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps < 12) {
        tick(STEP);
        acc -= STEP;
        steps++;
      }
      if (steps === 12) acc = 0;
    }

    if (!state.paused) stepCamera(dt);
    draw(t);

    hudT += dt;
    if (hudT > 0.06) {
      hudT = 0;
      if (state.screen === 'racing' || state.screen === 'done') {
        renderBoard(false);
        updateHud();
        drawMini();
      }
    }
  }


  function showCount(n) {
    const el = $('#countdown');
    if (n > 0) {
      el.hidden = false;
      el.innerHTML = `<b>${n}</b>`;
      audio.beep(440);
    } else if (n === 0) {
      el.hidden = false;
      el.innerHTML = '<b>GO!</b>';
      audio.beep(880);
      setTimeout(() => { el.hidden = true; }, 700);
    }
  }

  // the results board, once the rules have counted the race
  function showResults() {
    const list = standings();
    const you = state.player;
    audio.stop();

    $('#res-title').textContent = you.pos === 1 ? 'You won.' : `${ordinal(you.pos)} place`;
    const best = you.best < Infinity ? `Best lap ${fmtTime(you.best)}.` : '';
    const rec = save.best[state.track.id];
    $('#res-sub').textContent = `${state.track.name} — ${state.laps} laps. ${best} Track record ${fmtTime(rec)}.`;

    const ol = $('#resboard');
    ol.innerHTML = '';
    // rivals still out there finish on the spot, ordered by how far they got
    const pace = list.find((c) => !c.done);
    list.forEach((car, i) => {
      const li = document.createElement('li');
      if (car.isPlayer) li.className = 'is-you';
      const gapT = car.done ? fmtTime(car.doneAt)
        : `${gapText((pace || list[0]).prog - car.prog)} back`;
      li.innerHTML = `<span class="rank">${i + 1}</span>
        <span class="chip" style="background:${COLOURS[car.colour].body}"></span>
        <span class="who">${car.isPlayer ? 'You' : car.name}</span>
        <span class="gap">${gapT}</span>`;
      ol.appendChild(li);
    });
    $('#results').hidden = false;
    $('#arena').classList.remove('racing');
    $('#btn-pause').hidden = true;
  }

  function togglePause() {
    if (state.screen !== 'racing') {
      if (!$('#help').hidden) { $('#help').hidden = true; return; }
      return;
    }
    state.paused = !state.paused;
    $('#paused').hidden = !state.paused;
    if (state.paused) audio.stop(); else audio.start();
  }

  // ---------- audio ----------

  const audio = (() => {
    let ac = null, master = null, eng = null, engGain = null, engFilt = null;
    let scr = null, scrGain = null;
    let on = save.sound !== false;
    let running = false;

    function ensure() {
      if (ac || !on) return ac;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { on = false; return null; }
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.5;
      master.connect(ac.destination);
      return ac;
    }

    function buildEngine() {
      eng = ac.createOscillator();
      eng.type = 'sawtooth';
      eng.frequency.value = 60;
      engFilt = ac.createBiquadFilter();
      engFilt.type = 'lowpass';
      engFilt.frequency.value = 700;
      engFilt.Q.value = 4;
      engGain = ac.createGain();
      engGain.gain.value = 0;
      eng.connect(engFilt).connect(engGain).connect(master);
      eng.start();

      // tyre scrub is filtered noise
      const len = 2 * ac.sampleRate;
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      scr = ac.createBufferSource();
      scr.buffer = buf;
      scr.loop = true;
      const f = ac.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 2400;
      f.Q.value = 1.4;
      scrGain = ac.createGain();
      scrGain.gain.value = 0;
      scr.connect(f).connect(scrGain).connect(master);
      scr.start();
    }

    function blip(freq, dur, type, vol) {
      if (!ensure()) return;
      if (ac.state === 'suspended') ac.resume();
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type || 'square';
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.16, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0008, ac.currentTime + dur);
      o.connect(g).connect(master);
      o.start();
      o.stop(ac.currentTime + dur + 0.02);
    }

    return {
      get on() { return on; },
      toggle() {
        on = !on;
        save.sound = on;
        persist();
        if (!on && engGain) engGain.gain.value = 0;
        if (!on && scrGain) scrGain.gain.value = 0;
        return on;
      },
      start() {
        if (!ensure()) return;
        if (ac.state === 'suspended') ac.resume();
        if (!eng) buildEngine();
        running = true;
      },
      stop() {
        running = false;
        if (engGain) engGain.gain.value = 0;
        if (scrGain) scrGain.gain.value = 0;
      },
      frame(car, dt) {
        if (!on || !running || !ac || !engGain || !car) return;
        const sp = Math.hypot(car.vx, car.vy);
        const rev = clamp(sp / (car.topSpeed || 300), 0, 1.3);
        const target = 52 + rev * 180 + (car.boost > 0 ? 60 : 0);
        eng.frequency.value += (target - eng.frequency.value) * clamp(dt * 9, 0, 1);
        engFilt.frequency.value = 480 + rev * 1500;
        const want = (car.throttle > 0 ? 0.075 : 0.035) * clamp(0.35 + rev, 0, 1.2);
        engGain.gain.value += (want - engGain.gain.value) * clamp(dt * 8, 0, 1);
        const screech = car.slip > 0.3 && sp > 60 ? clamp((car.slip - 0.3) * 0.22, 0, 0.1) : 0;
        scrGain.gain.value += (screech - scrGain.gain.value) * clamp(dt * 12, 0, 1);
      },
      beep(f) { blip(f, 0.16, 'square', 0.13); },
      lap() { blip(660, 0.1, 'triangle', 0.12); setTimeout(() => blip(990, 0.14, 'triangle', 0.1), 90); },
      boost() { if (!ensure()) return; blip(300, 0.3, 'sawtooth', 0.12); setTimeout(() => blip(700, 0.25, 'sine', 0.08), 60); },
      whoosh() { blip(180, 0.22, 'sine', 0.09); },
      thud(v) { blip(80 + Math.random() * 40, 0.13, 'square', 0.1 * v); },
      scrape(v) { blip(1800 + Math.random() * 600, 0.05, 'sawtooth', clamp(v / 4000, 0.01, 0.05)); },
    };
  })();

  // ---------- menu ----------

  let pick = { track: TRACKS[0].id, laps: save.laps, cls: save.cls, colour: save.colour };

  function renderMenu() {
    const host = $('#tracklist');
    host.innerHTML = '';
    TRACKS.forEach((def) => {
      const btn = document.createElement('button');
      btn.className = 'trackcard' + (def.id === pick.track ? ' is-on' : '');
      btn.innerHTML = `<canvas width="240" height="150"></canvas><b>${def.name}</b><span>${def.blurb}</span>`;
      btn.onclick = () => { pick.track = def.id; renderMenu(); };
      host.appendChild(btn);
      sketchTrack(btn.querySelector('canvas'), def);
    });

    seg('#opt-laps', LAP_OPTS, pick.laps, (v) => { pick.laps = v; save.laps = v; persist(); renderMenu(); }, (v) => v);
    seg('#opt-class', CLASS_OPTS.map((c) => c.id), pick.cls,
      (v) => { pick.cls = v; save.cls = v; persist(); renderMenu(); },
      (v) => CLASS_OPTS.find((c) => c.id === v).name);

    const cp = $('#carpick');
    cp.innerHTML = '';
    PLAYER_COLOURS.forEach((c) => {
      const b = document.createElement('button');
      b.className = c === pick.colour ? 'is-on' : '';
      b.style.background = COLOURS[c].body;
      b.title = c;
      b.onclick = () => { pick.colour = c; save.colour = c; persist(); renderMenu(); };
      cp.appendChild(b);
    });

    const rec = save.best[pick.track];
    $('#menu-best').textContent = rec
      ? `Track record on this one: ${fmtTime(rec)}`
      : 'No lap set on this one yet.';

    previewTrack(TRACKS.find((t) => t.id === pick.track) || TRACKS[0]);
    renderMenuPanel(rec);
  }

  // The side panel would otherwise sit empty until the lights go out, so it
  // shows the field you are about to line up against.
  function renderMenuPanel(rec) {
    const field = [{ name: `You — ${pick.colour}`, colour: pick.colour, you: true }]
      .concat(RIVALS.filter((r) => r.colour !== pick.colour).slice(0, 4));
    hud.board.innerHTML = '';
    boardRows = [];
    field.forEach((r, i) => {
      const li = document.createElement('li');
      if (r.you) li.className = 'is-you';
      li.innerHTML = `<span class="rank">${i + 1}</span>
        <span class="chip" style="background:${COLOURS[r.colour].body}"></span>
        <span class="who">${r.name}</span><span class="gap"></span>`;
      hud.board.appendChild(li);
    });
    hud.lap.textContent = `–/${pick.laps}`;
    hud.time.textContent = '0:00.00';
    hud.pos.textContent = '—';
    hud.best.textContent = rec ? fmtTime(rec) : 'best —';
    hud.slip.style.width = '0%';
    hud.slipBox.classList.remove('is-ready');
  }

  function seg(sel, values, current, onPick, fmt) {
    const host = $(sel);
    host.innerHTML = '';
    values.forEach((v) => {
      const b = document.createElement('button');
      b.textContent = fmt ? fmt(v) : v;
      if (v === current) b.className = 'is-on';
      b.onclick = () => onPick(v);
      host.appendChild(b);
    });
  }

  // a little wire diagram of the lap for the picker
  const sketchCache = Object.create(null);

  function sketchTrack(cv, def) {
    const tr = sketchCache[def.id] || (sketchCache[def.id] = buildTrack(def));
    const g = cv.getContext('2d');
    const pad = 10;
    const s = Math.min((cv.width - pad * 2) / DESK_W, (cv.height - pad * 2) / DESK_H);
    g.clearRect(0, 0, cv.width, cv.height);
    // on its own ground, so the picker says where in the house it is
    const T = themeOf(def);
    if (loaded(T.ground)) {
      g.drawImage(art[T.ground], 0, 0, cv.width, cv.height);
      g.fillStyle = 'rgba(16,14,20,0.30)';
      g.fillRect(0, 0, cv.width, cv.height);
    }
    g.save();
    g.translate((cv.width - DESK_W * s) / 2, (cv.height - DESK_H * s) / 2);
    g.scale(s, s);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const run of tr.runs) {
      centreLine(g, tr, run);
      g.strokeStyle = 'rgba(20,16,24,0.55)';
      g.lineWidth = 74;
      g.stroke();
    }
    for (const run of tr.runs) {
      centreLine(g, tr, run);
      g.strokeStyle = MINI_COL[run.surf] || '#999';
      g.lineWidth = 50;
      g.stroke();
    }
    const p = tr.pts[0];
    g.restore();
    g.fillStyle = '#ef7b35';
    g.beginPath();
    g.arc((cv.width - DESK_W * s) / 2 + p.x * s, (cv.height - DESK_H * s) / 2 + p.y * s, 4, 0, TAU);
    g.fill();
  }

  // ---------- wiring ----------

  function go() {
    $('#menu').hidden = true;
    $('#results').hidden = true;
    $('#paused').hidden = true;
    state.paused = false;
    const def = TRACKS.find((t) => t.id === pick.track) || TRACKS[0];
    startRace(def, { laps: pick.laps, cls: pick.cls, colour: pick.colour });
  }

  $('#btn-go').onclick = go;
  $('#btn-again').onclick = go;
  $('#btn-menu').onclick = () => {
    $('#results').hidden = true;
    $('#menu').hidden = false;
    state.screen = 'menu';
    renderMenu();
  };
  $('#btn-resume').onclick = togglePause;
  $('#btn-pause').onclick = (e) => { e.currentTarget.blur(); if (!state.paused) togglePause(); };
  // start as if the page had never been opened: every unlock and best lap gone
  $('#btn-restart').onclick = () => {
    if (!confirm('Start over? Every best lap and unlock will be wiped.')) return;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    location.reload();
  };
  $('#btn-quit').onclick = () => {
    state.paused = false;
    $('#paused').hidden = true;
    $('#results').hidden = true;
    $('#menu').hidden = false;
    state.screen = 'menu';
    $('#arena').classList.remove('racing');
    $('#btn-pause').hidden = true;
    audio.stop();
    renderMenu();
  };
  // the help sheet names the surfaces after what they are on the picked track
  $('#btn-help').onclick = () => {
    const def = state.screen === 'menu' ? TRACKS.find((t) => t.id === pick.track) : state.trackDef;
    const words = themeOf(def || TRACKS[0]).words;
    for (const el of document.querySelectorAll('#help [data-word]')) {
      const w = words[el.dataset.word];
      if (w) el.textContent = w[0].toUpperCase() + w.slice(1);
    }
    // and leaves out the jump on a track that has none
    const has = new Set((def || TRACKS[0]).nodes.map((n) => n[3]));
    for (const el of document.querySelectorAll('#help [data-if]')) el.hidden = !has.has(el.dataset.if);
    $('#help').hidden = false;
  };
  $('#btn-help-close').onclick = () => { $('#help').hidden = true; };
  $('#btn-sound').onclick = (e) => {
    const on = audio.toggle();
    e.currentTarget.setAttribute('aria-pressed', String(on));
    if (on && state.screen === 'racing') audio.start();
  };
  $('#btn-sound').setAttribute('aria-pressed', String(save.sound !== false));

  window.addEventListener('resize', fitCanvas);

  // ---------- boot ----------

  fitCanvas();
  renderMenu();
  requestAnimationFrame(frame);

  // the picked track's theme first, then the rest one after another, so the
  // menu's cards fill in without the first race waiting behind all of them
  (() => {
    const first = themeOf(TRACKS.find((t) => t.id === pick.track) || TRACKS[0]);
    const order = Object.keys(THEMES).sort((a, b) => (THEMES[b] === first) - (THEMES[a] === first));
    order.reduce((p, id) => p.then(() => loadTheme(id)), Promise.resolve());
  })();

  // ---------- the debug handle ----------

  expose('__toyRacers', {
    sim: racers, seedDice: racers.seedDice,
    state, TRACKS, THEMES, COLOURS, SURF, debug, cam, view, trackProps, loadTheme,
    get cars() { return state.cars; },
    get track() { return state.track; },
    get player() { return state.player; },
    standings,
    start(trackId, opts) {
      pick = Object.assign({}, pick, { track: trackId || pick.track }, opts || {});
      go();
      return state.track;
    },
    // drop a car at a fraction round the lap, for tests
    put(car, frac, off) {
      const tr = state.track;
      const i = Math.round(clamp(frac, 0, 0.999) * tr.count) % tr.count;
      const p = tr.pts[i];
      car.x = p.x + p.nx * (off || 0);
      car.y = p.y + p.ny * (off || 0);
      car.ang = p.ang;
      car.si = i; car.prevS = p.s;
      car.vx = 0; car.vy = 0; car.air = false; car.z = 0;
      return car;
    },
    // run the sim with no rendering, for tests
    sim(seconds) {
      const n = Math.round(seconds / STEP);
      for (let i = 0; i < n; i++) tick(STEP);
      return standings().map((c) => ({ name: c.name, lap: c.lap, prog: Math.round(c.prog), pos: c.pos }));
    },
    fmtTime, buildTrack, DESK_W, DESK_H,
    // what the car can actually do, so a test can work out whether a corner
    // is takeable rather than guessing at it
    HANDLING: { TURN, TURN_V, LAT_ACCEL, LAT_FLOOR, TOP_SPEED, ACCEL, BRAKE, CAR_WID, CAR_R },
  });
