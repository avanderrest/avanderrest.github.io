/* Route Builder: the screen. Draws the felt mat, the town, the wooden track and trains,
   the HUD and the toy box, and turns pointer drags and clicks into sim.js verbs. */
import { createRouteBuilder } from './sim.js';
import { readSeed, writeSeed } from '../lib/seed.js';
import { expose } from '../lib/debug.js';

  const rb = createRouteBuilder({ on: onEvent, measure: { trainLength: (t) => trainLength(t), get ahead() { return TRAIN_AHEAD; } } });
  const {
    seeded, segsCross, segIntersectPoint, pointSegDist, stationById, lineById, makeRiver, riverCrossings, segmentCrossesRiver, nearRiver, trackSegments, nearTrack, makeNeighborhoods, makeTrees, sameBank, housesNear, neighbourhoodRadius, neighbourhoodService, houseSpotFree, growthCentres, addHouse, growHouse, houseInterval, grantGrowthGifts, nextGift, clearAround, availableTypes, nextStationType, pickName, randomStationSpot, createStation, spawnStation, whyNotStation, placeStation, removeStation, upgradeInfo, upgradeStation, newGame, resumeGame, rebuildRouting, stationsWithTrains, endpointOf, beginDraft, tryAppendDraft, segmentPieces, draftSegments, costOf, commitDraft, extendLine, shortfall, cancelDraft, newTrain, placeTrain, trainCapacity, addCarriage, returnTrain, removeTrain, removeLine, pressureDay, pegInterval, destinationsFrom, spawnPegs, nearestStation, walkersFor, spawnWalkers, updateWalkers, walkerPosition, growTown, deliverPeg, onwardWays, nextStop, gets, exchange, board, arrive, turnRound, updateTrains, updateHappiness, maybeAdvanceDay, step, tick, endGame, linePathPoints, laneMap, platformRadius, WORLD, RIVER_HALFWIDTH, STATION_MIN_GAP, STATION_WORLD_R, TRAIN_HIT_R, CLICK_FORGIVE_PX, ZOOM_MAX, TYPE_ORDER, TYPES, COLOUR_NAMES, CASTLE_UNLOCK_DAY, MAX_LINES, TRAIN_COLORS, START_INV, INV_NAMES, TRACK_PIECE_LEN, MAX_CARRIAGES, GROWTH_GIFTS, MAX_HOUSES, HOUSE_MIN_GAP, DENSITY_R, STATION_RANGE, CARRIAGE_CAP_BONUS, TRAIN_CAP_BASE, TRAIN_SPEED, STATION_BASE_CAP, STATION_DWELL, UPGRADE_COST, MAX_STATIONS, GRIDLOCK_MULT, SPEEDS, DAY_LEN, WEEK_DAYS, HAPPINESS_DRAIN_PER_OVER, HAPPINESS_REGEN, PRESSURE_PACE, WALK_SPEED, WALK_MAX, WALKER_WEIGHT, WALKER_PATIENCE, GRUMBLE_DRAIN, NAME_POOL, rand, pick, clamp, dist, edgeKey, invName, RUN_FIELDS, stations, lines, trains, fx, stationRange, stationHouses, feeds, isConnected, hasTrack, affordable, pegBase, platformFull, grumbling, MAX_TURN, coreRadius,
  } = rb;

  function onEvent(ev, d) {
    switch (ev) {
      case 'toast': toast(d); break;
      case 'sfx': audio[d](); break;
      case 'gift': pulseInventory(d); break;
      case 'save': persistRun(); break;
      case 'clear-run': clearRun(); break;
      case 'new-game': camera.manual = false; writeSeed(rb.state.seed); break;
      case 'game-over': onGameOver(); break;
    }
  }

  // ---------- saving ----------
  // v2: coins gave way to a toy-box inventory and the town now grows house by
  // house, so a v1 run save has nothing this version could resume from.
  const SAVE_KEY = 'route-builder-save-v2';
  try { localStorage.removeItem('route-builder-save-v1'); localStorage.removeItem('route-builder-save-v1-run'); } catch (e) { /* storage blocked */ }

  const $ = (sel) => document.querySelector(sel);

  // ---------- audio ----------

  const audio = (() => {
    let ac = null, master = null;
    let on = true;
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
    function blip(freq, durs, type, vol) {
      if (!on || !ensure()) return;
      if (ac.state === 'suspended') ac.resume();
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type || 'square';
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.15, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0008, ac.currentTime + durs);
      o.connect(g).connect(master);
      o.start();
      o.stop(ac.currentTime + durs + 0.02);
    }
    return {
      get on() { return on; },
      set on(v) { on = !!v; },
      toggle() { on = !on; return on; },
      clack() { blip(220, 0.07, 'square', 0.12); },
      chime() { blip(880, 0.12, 'triangle', 0.1); setTimeout(() => blip(1320, 0.14, 'triangle', 0.08), 60); },
      whistle() { blip(660, 0.3, 'sine', 0.09); },
      pop() { blip(520, 0.05, 'triangle', 0.05); },
      warn() { blip(180, 0.2, 'sawtooth', 0.1); },
    };
  })();

  // ---------- persistent settings + best scores ----------

  let save = {};
  try { save = JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch (e) { save = {}; }
  save.best = save.best || { days: 0, delivered: 0, houses: 0 };
  audio.on = save.sound !== false;

  function persistSettings() {
    try {
      const out = { best: save.best, sound: audio.on, mode: rb.state ? rb.state.mode : save.mode };
      localStorage.setItem(SAVE_KEY, JSON.stringify(out));
    } catch (e) { /* storage blocked */ }
  }

  const RUN_KEY = SAVE_KEY + '-run';
  function persistRun() {
    if (!rb.state || rb.state.gameOver) return;
    try {
      const out = {};
      RUN_FIELDS.forEach((k) => { out[k] = rb.state[k]; });
      out.bridges = [...state.bridges];
      localStorage.setItem(RUN_KEY, JSON.stringify({ state: out, stations, lines, trains }));
    } catch (e) { /* storage blocked, or quota — just skip autosave */ }
  }
  function loadRun() {
    try {
      const raw = localStorage.getItem(RUN_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }
  function clearRun() {
    try { localStorage.removeItem(RUN_KEY); } catch (e) { /* ignore */ }
  }


  // ---------- game over ----------

  function onGameOver() {
    setSpeedUI(0);
    clearRun();
    save.best.days = Math.max(save.best.days || 0, rb.state.stats.daysSurvived);
    save.best.delivered = Math.max(save.best.delivered || 0, rb.state.stats.delivered);
    save.best.houses = Math.max(save.best.houses || 0, rb.state.houses.length);
    persistSettings();
    renderResults();
    $('#results').hidden = false;
  }
  function renderResults() {
    $('#res-sub').textContent = `Happiness ran out on day ${rb.state.stats.daysSurvived}, week ${rb.state.week}.`;
    const rows = [
      ['Passengers delivered', rb.state.stats.delivered],
      ['Days survived', rb.state.stats.daysSurvived],
      ['Houses in town', rb.state.houses.length],
      ['Best delivered', save.best.delivered],
      ['Best days', save.best.days],
      ['Biggest town', save.best.houses],
    ];
    const ol = $('#resboard');
    ol.innerHTML = '';
    rows.forEach(([label, val]) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="who">${label}</span><b>${val}</b>`;
      ol.appendChild(li);
    });
  }

  // ---------- camera ----------
  // The mat always fills the view: you can't zoom out past it or pan off its
  // edge. It auto-fits to the town until you take the wheel yourself, and
  // "Fit view" hands it back.

  const camera = { cx: WORLD.w / 2, cy: WORLD.h / 2, scale: 0.6, manual: false };
  function minScale() { return Math.max(canvasCW / WORLD.w, canvasCH / WORLD.h); }
  function clampCamera() {
    const lo = minScale();
    camera.scale = clamp(camera.scale, lo, Math.max(ZOOM_MAX, lo * 1.5));
    const hw = canvasCW / 2 / camera.scale, hh = canvasCH / 2 / camera.scale;
    camera.cx = clamp(camera.cx, hw, WORLD.w - hw);
    camera.cy = clamp(camera.cy, hh, WORLD.h - hh);
  }
  function updateCamera(dt) {
    if (!camera.manual) {
      const pts = stations.concat(rb.state.houses);
      let targetScale = minScale(), targetCx = WORLD.w / 2, targetCy = WORLD.h / 2;
      if (pts.length) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        pts.forEach((p) => {
          minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
          minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
        });
        const margin = 200;
        minX -= margin; minY -= margin; maxX += margin; maxY += margin;
        const w = Math.max(500, maxX - minX), h = Math.max(340, maxY - minY);
        targetScale = clamp(Math.min(canvasCW / w, canvasCH / h), minScale(), 1.1);
        targetCx = (minX + maxX) / 2; targetCy = (minY + maxY) / 2;
      }
      const k = clamp(dt * 1.4, 0, 1);
      camera.cx += (targetCx - camera.cx) * k;
      camera.cy += (targetCy - camera.cy) * k;
      camera.scale += (targetScale - camera.scale) * k;
    }
    clampCamera();
  }
  function worldToScreen(x, y) {
    return { x: canvasCW / 2 + (x - camera.cx) * camera.scale, y: canvasCH / 2 + (y - camera.cy) * camera.scale };
  }
  function screenToWorld(x, y) {
    return { x: camera.cx + (x - canvasCW / 2) / camera.scale, y: camera.cy + (y - canvasCH / 2) / camera.scale };
  }
  // Zoom by `factor`, keeping the world point under screen (sx, sy) still.
  function zoomAt(sx, sy, factor) {
    const before = screenToWorld(sx, sy);
    camera.scale *= factor;
    camera.manual = true;
    clampCamera();
    const after = screenToWorld(sx, sy);
    camera.cx += before.x - after.x;
    camera.cy += before.y - after.y;
    clampCamera();
  }

  // ---------- rendering ----------

  const canvas = $('#mat');
  const ctx = canvas.getContext('2d');
  const arena = $('#arena');
  let canvasCW = 800, canvasCH = 600, dpr = 1;

  function fitCanvas() {
    const rect = arena.getBoundingClientRect();
    dpr = Math.max(1, window.devicePixelRatio || 1);
    canvasCW = rect.width; canvasCH = rect.height;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (rb.state) clampCamera();
  }

  // Amber's painted set, cut from her sheets in images/minigames/route-builder.
  // Every draw function checks for its sprite and falls back to the canvas
  // drawing, so nothing has a hole while they load (or if one is missing).
  const textures = {};
  const sprites = {};
  const SPRITE_FILES = {
    bridge: 'bridge.png',
    ...Object.fromEntries(TYPE_ORDER.map((t) => [`station-${t}`, `station-${t}.png`])),
    ...Object.fromEntries(TRAIN_COLORS.flatMap((_, i) => [[`loco-${i}`, `loco-${i}.png`], [`car-${i}`, `car-${i}.png`]])),
    ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`house-${i}`, `house-${i}.png`])),
    ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`tree-${i}`, `tree-${i}.png`])),
  };
  const HOUSE_SPRITES = 12, TREE_SPRITES = 10;
  // Sprite sizes are kept relative within each sheet, so one scale per sheet
  // turns image pixels into world units.
  const SPRITE_SCALE = { house: 0.2, tree: 0.21, station: 0.27 };
  function loadTextures() {
    const files = { felt: 'felt.jpg', river: 'river.jpg', wood: 'wood.jpg' };
    const load = (src, done) => new Promise((res) => {
      const img = new Image();
      img.onload = () => { done(img); res(); };
      img.onerror = () => res();
      img.src = `assets/${src}`;
    });
    return Promise.all([
      ...Object.entries(files).map(([key, src]) => load(src, (img) => { textures[key] = ctx.createPattern(img, 'repeat'); })),
      ...Object.entries(SPRITE_FILES).map(([key, src]) => load(src, (img) => { sprites[key] = img; })),
    ]);
  }
  // A texture pattern at a given world scale, offset so a stroke centred on
  // y = 0 samples the middle of the image rather than its top edge.
  function patternAt(key, scale, dy = 0) {
    const p = textures[key];
    if (p && p.setTransform) p.setTransform(new DOMMatrix().translateSelf(0, dy).scaleSelf(scale, scale));
    return p;
  }

  // What the set is made of. Drawing only — none of this touches the rules.
  const UI_FONT = '"Shantell Sans", "Nunito", ui-rounded, system-ui, sans-serif';
  const TRACK_W = 18;              // one wooden track piece, side to side, world units
  const WOOD = { light: '#f0d29d', mid: '#d9a864', dark: '#b27b3f', edge: '#7d5530' };
  const PEG_HEAD = '#f3d3a4';
  const TRACK_WOOD = '#dfae6c';
  const POINTS_OFF = '#cf5a44';    // a stretch the next train through a junction won't take
  const ROOF_COLORS = ['#d1533b', '#3f84b0', '#e0ac2a', '#5a9c4e', '#c1602f', '#8a63b0'];
  const WALL_COLORS = ['#fbf1dc', '#f6e2c6', '#eef1ea', '#f8e9b8'];
  const TREE_GREENS = [['#6aae5a', '#4d8b45'], ['#5c9f55', '#3f7a3d'], ['#7ab85e', '#5a9447']];

  // hex colour arithmetic, cached — the same few colours are mixed every frame
  const mixCache = new Map();
  function mix(a, b, t) {
    const key = a + b + t;
    let out = mixCache.get(key);
    if (out) return out;
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = (s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
    out = `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
    mixCache.set(key, out);
    return out;
  }
  const shade = (hex, t) => (t >= 0 ? mix(hex, '#ffffff', t) : mix(hex, '#000000', -t));
  // A stable number per spot on the mat, so a house keeps its roof colour and
  // a tree its shape from frame to frame without storing either.
  const hashXY = (x, y) => (((Math.round(x) * 73856093) ^ (Math.round(y) * 19349663)) >>> 0);
  const easeOutBack = (t) => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // ----- the mat -----

  // Felt appliqué: a few big stitched-on patches of lighter and darker green.
  // They come from the river's shape, so a run keeps the same patches when
  // it's resumed without having to save them.
  let patchCache = { key: null, patches: [] };
  function feltPatches() {
    const key = rb.state.river.map((p) => Math.round(p.y)).join(',');
    if (patchCache.key === key) return patchCache.patches;
    const rng = seeded(rb.state.river.reduce((a, p) => a + Math.round(p.y * 3 + p.x), 0) % 233280);
    const patches = [];
    for (let i = 0; i < 11; i++) {
      const cx = 80 + rng() * (WORLD.w - 160), cy = 80 + rng() * (WORLD.h - 160);
      const r = 90 + rng() * 150, pts = [];
      const n = 9;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2, rr = r * (0.72 + rng() * 0.45);
        pts.push({ x: cx + Math.cos(a) * rr * 1.25, y: cy + Math.sin(a) * rr * 0.85 });
      }
      patches.push({ pts, light: rng() < 0.55 });
    }
    patchCache = { key, patches };
    return patches;
  }
  // A closed shape through the midpoints of its corners — soft, cut-cloth edges.
  function blobPath(pts) {
    ctx.beginPath();
    const n = pts.length;
    const mid = (i) => ({ x: (pts[i % n].x + pts[(i + 1) % n].x) / 2, y: (pts[i % n].y + pts[(i + 1) % n].y) / 2 });
    const m0 = mid(0);
    ctx.moveTo(m0.x, m0.y);
    for (let i = 1; i <= n; i++) {
      const m = mid(i);
      ctx.quadraticCurveTo(pts[i % n].x, pts[i % n].y, m.x, m.y);
    }
    ctx.closePath();
  }

  function drawMat() {
    // Amber's green felt is dyed already, so it goes down as it is.
    ctx.fillStyle = patternAt('felt', 0.8) || '#5f9a55';
    ctx.fillRect(0, 0, WORLD.w, WORLD.h);
    feltPatches().forEach((p) => {
      blobPath(p.pts);
      ctx.fillStyle = p.light ? 'rgba(196, 226, 128, 0.12)' : 'rgba(40, 80, 40, 0.14)';
      ctx.fill();
      ctx.save();
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = p.light ? 'rgba(255, 250, 215, 0.26)' : 'rgba(30, 60, 30, 0.26)';
      ctx.stroke();
      ctx.restore();
    });
  }

  // The binding round the mat's edge, and its running stitch.
  function drawMatEdge() {
    ctx.save();
    ctx.strokeStyle = '#3f6e3c';
    ctx.lineWidth = 14;
    ctx.strokeRect(0, 0, WORLD.w, WORLD.h);
    ctx.strokeStyle = 'rgba(255, 244, 210, 0.6)';
    ctx.lineWidth = 2.2;
    ctx.setLineDash([10, 8]);
    ctx.strokeRect(16, 16, WORLD.w - 32, WORLD.h - 32);
    ctx.restore();
  }

  function riverPath() {
    ctx.beginPath();
    rb.state.river.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  }
  // Blue felt laid on the green: a shadowed bank, a stitched edge each side,
  // and a few pale ripples down the middle.
  function drawRiver() {
    const w = RIVER_HALFWIDTH * 2;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    riverPath();
    ctx.strokeStyle = 'rgba(30, 55, 25, 0.35)';
    ctx.lineWidth = w + 12;
    ctx.stroke();
    ctx.strokeStyle = '#3f7fb2';
    ctx.lineWidth = w + 2;
    ctx.stroke();
    // stitches: a dashed band just inside each edge, then the water over its middle
    ctx.setLineDash([7, 6]);
    ctx.strokeStyle = 'rgba(230, 244, 255, 0.75)';
    ctx.lineWidth = w - 5;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = patternAt('river', 0.32) || '#5ea1d0';
    ctx.lineWidth = w - 9;
    ctx.stroke();
    ctx.strokeStyle = textures.river ? 'rgba(160, 210, 240, 0.18)' : 'rgba(160, 210, 240, 0.55)';
    ctx.lineWidth = w * 0.35;
    ctx.stroke();
    // ripples drift downstream
    ctx.setLineDash([18, 46]);
    ctx.lineDashOffset = -performance.now() / 90;
    ctx.strokeStyle = textures.river ? 'rgba(255, 255, 255, 0.22)' : 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 2.4;
    ctx.save(); ctx.translate(0, -7); riverPath(); ctx.stroke(); ctx.restore();
    ctx.lineDashOffset = -performance.now() / 90 + 30;
    ctx.save(); ctx.translate(0, 8); riverPath(); ctx.stroke(); ctx.restore();
    ctx.restore();
  }

  // ----- trees and houses -----

  function drawTree(t) {
    const h = hashXY(t.x, t.y);
    const [lite, dark] = TREE_GREENS[h % TREE_GREENS.length];
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.scale(t.scale, t.scale);
    ctx.fillStyle = 'rgba(25, 50, 20, 0.28)';
    ctx.beginPath(); ctx.ellipse(6, 11, 13, 5, 0, 0, Math.PI * 2); ctx.fill();
    const img = sprites[`tree-${(h >>> 3) % TREE_SPRITES}`];
    if (img) {
      // standing on its base, which sits where the drawn trunk's foot was
      const w = img.width * SPRITE_SCALE.tree, ht = img.height * SPRITE_SCALE.tree;
      ctx.drawImage(img, -w / 2, 13 - ht, w, ht);
      ctx.restore();
      return;
    }
    ctx.fillStyle = '#8a5a30';
    ctx.fillRect(-2.5, 2, 5, 10);
    ctx.fillStyle = '#6d4424';
    ctx.fillRect(0.5, 2, 2, 10);
    if (h % 4 === 3) {
      // a round wooden lollipop tree
      ctx.fillStyle = dark;
      ctx.beginPath(); ctx.arc(0, -6, 11.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = lite;
      ctx.beginPath(); ctx.arc(-1.8, -7.8, 9.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 230, 0.35)';
      ctx.beginPath(); ctx.ellipse(-4.5, -11, 3.6, 2.4, -0.6, 0, Math.PI * 2); ctx.fill();
    } else {
      // a stacked fir: each tier lit on the left, in shade on the right
      for (let i = 0; i < 3; i++) {
        const top = -21 + i * 7, base = 3 + i * 3, half = 13 - i * 2.2;
        ctx.fillStyle = dark;
        ctx.beginPath(); ctx.moveTo(0, top); ctx.lineTo(half, base - i * 5); ctx.lineTo(-half, base - i * 5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = lite;
        ctx.beginPath(); ctx.moveTo(0, top); ctx.lineTo(0, base - i * 5); ctx.lineTo(-half, base - i * 5); ctx.closePath(); ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawToyHouse(hs) {
    const h = hashXY(hs.x, hs.y);
    const roof = ROOF_COLORS[h % ROOF_COLORS.length];
    const wall = WALL_COLORS[(h >> 4) % WALL_COLORS.length];
    // a new house pops up out of the felt
    const age = hs.born !== undefined ? (rb.state.totalTime - hs.born) / 0.45 : 1;
    const grow = age >= 1 ? 1 : easeOutBack(clamp(age, 0, 1));
    if (grow <= 0.02) return;
    ctx.save();
    ctx.translate(hs.x, hs.y);
    ctx.scale(hs.scale * grow * 1.2, hs.scale * grow * 1.2);
    const img = sprites[`house-${(h >>> 2) % HOUSE_SPRITES}`];
    if (img) {
      const w = img.width * SPRITE_SCALE.house, ht = img.height * SPRITE_SCALE.house;
      ctx.fillStyle = 'rgba(25, 50, 20, 0.3)';
      roundRect(ctx, -w / 2 + 4, 4, w, 10, 4); ctx.fill();
      ctx.drawImage(img, -w / 2, 12 - ht, w, ht);
      ctx.restore();
      return;
    }
    ctx.fillStyle = 'rgba(25, 50, 20, 0.3)';
    roundRect(ctx, -8, 1, 24, 14, 3); ctx.fill();
    // walls
    ctx.fillStyle = wall;
    ctx.fillRect(-10, -2, 20, 13);
    ctx.fillStyle = 'rgba(90, 60, 30, 0.14)';
    ctx.fillRect(4, -2, 6, 13);
    ctx.strokeStyle = 'rgba(90, 60, 30, 0.4)';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(-10, -2, 20, 13);
    ctx.fillStyle = '#9a6536';
    ctx.fillRect(-2.2, 4, 4.4, 7);
    ctx.fillStyle = '#a9d3e8';
    ctx.fillRect(-8, 1.5, 4, 3.8);
    ctx.fillRect(4.5, 1.5, 4, 3.8);
    // roof, lit on its near slope
    if (h % 3 === 0) { ctx.fillStyle = '#8a5a30'; ctx.fillRect(4, -15, 3.2, 6); }
    ctx.fillStyle = shade(roof, -0.18);
    ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(13, 0); ctx.lineTo(9, -13); ctx.lineTo(-9, -13); ctx.closePath(); ctx.fill();
    ctx.fillStyle = roof;
    ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(13, 0); ctx.lineTo(11, -6); ctx.lineTo(-11, -6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.fillRect(-9, -13, 18, 1.6);
    ctx.restore();
  }

  // ----- station emblems, labels, pegs -----

  function drawGlyph(type, x, y, r, color = '#fff8ec') {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    const s = r * 0.5;
    if (type === 'house') {
      ctx.beginPath();
      ctx.moveTo(-s, s * 0.15); ctx.lineTo(-s, s); ctx.lineTo(s, s); ctx.lineTo(s, s * 0.15);
      ctx.lineTo(0, -s); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (type === 'shop') {
      ctx.beginPath(); ctx.rect(-s, -s * 0.2, s * 2, s * 1.2); ctx.fill(); ctx.stroke();
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.arc(i * s * 0.4, -s * 0.2, s * 0.24, Math.PI, 0);
        ctx.fill();
      }
    } else if (type === 'school') {
      ctx.beginPath(); ctx.rect(-s, -s * 0.3, s * 2, s * 1.3); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(0, -s * 0.3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.6, -s * 0.8); ctx.lineTo(0, -s * 0.62); ctx.closePath(); ctx.fill();
    } else if (type === 'park') {
      ctx.beginPath(); ctx.arc(0, -s * 0.1, s * 0.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillRect(-s * 0.12, s * 0.4, s * 0.24, s * 0.5);
    } else {
      ctx.beginPath(); ctx.rect(-s, -s * 0.4, s * 2, s * 1.4); ctx.fill(); ctx.stroke();
      ctx.beginPath();
      for (let i = -1; i <= 1; i++) { ctx.rect(i * s * 0.7 - s * 0.18, -s * 0.9, s * 0.36, s * 0.5); }
      ctx.fill();
    }
    ctx.restore();
  }

  // A little cream tag in screen pixels at a world position, so it stays
  // readable at any zoom. It has to drop the world transform first — drawing
  // screen coordinates inside it is what used to throw station names off
  // across the mat whenever the camera wasn't at 1x.
  function drawWorldLabel(text, x, y, color, size = 12) {
    const p = worldToScreen(x, y);
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `600 ${size}px ${UI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 14, h = size + 9;
    ctx.fillStyle = 'rgba(58, 40, 20, 0.22)';
    roundRect(ctx, p.x - w / 2, p.y - h / 2 + 2, w, h, h / 2); ctx.fill();
    ctx.fillStyle = 'rgba(255, 249, 236, 0.94)';
    roundRect(ctx, p.x - w / 2, p.y - h / 2, w, h, h / 2); ctx.fill();
    ctx.fillStyle = color || '#3a2c1c';
    ctx.fillText(text, p.x, p.y + 0.5);
    ctx.restore();
  }

  // A station's name board: painted green, framed in wood, on two posts.
  // (x, y) is where the posts meet the platform.
  function drawSign(text, x, y) {
    const p = worldToScreen(x, y);
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fs = clamp(9 + camera.scale * 4, 11, 17);
    ctx.font = `600 ${fs}px ${UI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + fs * 1.5, h = fs + 9, top = p.y - 7 - h;
    ctx.fillStyle = WOOD.dark;
    ctx.fillRect(p.x - w / 2 + 8, top + h - 2, 3, 9);
    ctx.fillRect(p.x + w / 2 - 11, top + h - 2, 3, 9);
    ctx.fillStyle = 'rgba(30, 40, 20, 0.3)';
    roundRect(ctx, p.x - w / 2 + 1, top + 3, w, h, 5); ctx.fill();
    ctx.fillStyle = WOOD.mid;
    roundRect(ctx, p.x - w / 2, top, w, h, 5); ctx.fill();
    ctx.fillStyle = '#2f5a40';
    roundRect(ctx, p.x - w / 2 + 2.5, top + 2.5, w - 5, h - 5, 3.5); ctx.fill();
    ctx.fillStyle = '#fff1d2';
    ctx.fillText(text, p.x, top + h / 2 + 0.5);
    ctx.restore();
  }

  // A peg person: wooden head, painted body, a little shadow.
  function drawPeg(x, y, color, r) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(25, 45, 20, 0.3)';
    ctx.beginPath(); ctx.ellipse(r * 0.15, r * 0.62, r * 0.55, r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-r * 0.45, r * 0.6);
    ctx.bezierCurveTo(-r * 0.5, r * 0.05, -r * 0.3, -r * 0.12, 0, -r * 0.12);
    ctx.bezierCurveTo(r * 0.3, -r * 0.12, r * 0.5, r * 0.05, r * 0.45, r * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.beginPath(); ctx.ellipse(-r * 0.2, r * 0.22, r * 0.1, r * 0.28, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = PEG_HEAD;
    ctx.beginPath(); ctx.arc(0, -r * 0.42, r * 0.34, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath(); ctx.arc(-r * 0.12, -r * 0.54, r * 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ----- track -----

  // Lines sharing a stretch lie side by side, a track's width apart. The
  // sideways direction is taken from the lower station id to the higher, so
  // it agrees whichever way along the stretch a line happens to run.
  function laneOffset(lanes, lineId, a, b) {
    const on = lanes.get(edgeKey(a.id, b.id));
    if (!on || on.length < 2) return { x: 0, y: 0 };
    const off = (on.indexOf(lineId) - (on.length - 1) / 2) * TRACK_W;
    const [p, q] = a.id < b.id ? [a, b] : [b, a];
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    return { x: (-(q.y - p.y) / len) * off, y: ((q.x - p.x) / len) * off };
  }
  // Every stretch of track on the board, each shifted into its own lane.
  function trackStretches() {
    const lanes = laneMap(), out = [];
    lines.forEach((line) => {
      const pts = linePathPoints(line), n = pts.length;
      const segs = line.loop && n > 2 ? n : n - 1;
      for (let i = 0; i < segs; i++) {
        const a = pts[i], b = pts[(i + 1) % n];
        const o = laneOffset(lanes, line.id, a, b);
        out.push({ line, a, b, ax: a.x + o.x, ay: a.y + o.y, bx: b.x + o.x, by: b.y + o.y });
      }
    });
    return out;
  }

  // How the points are set at each junction, as the next train through will
  // find them: the stretches it WON'T take, as "stationId|neighbourId" from
  // the junction's side. The next train through is one standing there (its
  // way is already picked), else the nearest one on its way in.
  function pointsAgainst() {
    const off = new Set();
    stations.forEach((s) => {
      if ((rb.routing.adj.get(s.id) || []).length < 3) return;
      let next = null, nextD = Infinity;
      trains.forEach((t) => {
        let d = Infinity;
        if (t.at === s.id && t.atStation && t.to !== null) d = 0;   // standing here, way already picked
        else if (t.to === s.id && !t.atStation) d = (1 - t.prog) * dist(stationById(t.at), s);
        else if (t.to === s.id && t.atStation) d = dist(stationById(t.at), s) + 1;
        if (d < nextD) { nextD = d; next = t; }
      });
      if (!next) return;
      const standing = next.at === s.id;
      const onward = onwardWays(standing ? next.prev : next.at, s);
      if (onward.length < 2) return;
      const taken = standing ? next.to : onward[((s.points || 0) + 1) % onward.length];
      onward.forEach((id) => { if (id !== taken) off.add(`${s.id}|${id}`); });
    });
    return off;
  }

  // Wooden track, all plain maple, with the two grooves the wheels run in
  // and a jigsaw joint between every piece it took from the box. The half of
  // a stretch next to a junction is painted red when the points there are
  // set against it for the next train through.
  function drawTracks() {
    const stretches = trackStretches();
    const running = stationsWithTrains();
    const off = pointsAgainst();
    // the Remove tool shows exactly which run of track a click would pull up
    const doomed = rb.state.tool === 'remove' && hover && !trainAt(hover) && !stationAt(hover) ? lineAt(hover) : null;
    const hw = TRACK_W / 2 - 0.5;
    const frame = (s) => {
      ctx.translate(s.ax, s.ay);
      ctx.rotate(Math.atan2(s.by - s.ay, s.bx - s.ax));
      return Math.hypot(s.bx - s.ax, s.by - s.ay);
    };
    ctx.save();
    stretches.forEach((s) => {
      ctx.save();
      const L = frame(s);
      ctx.fillStyle = 'rgba(25, 45, 20, 0.3)';
      ctx.rotate(-Math.atan2(s.by - s.ay, s.bx - s.ax));
      ctx.translate(3, 4);
      ctx.rotate(Math.atan2(s.by - s.ay, s.bx - s.ax));
      ctx.fillRect(0, -hw, L, hw * 2);
      ctx.restore();
    });
    stretches.forEach((s) => {
      ctx.save();
      const L = frame(s);
      const wood = TRACK_WOOD;
      ctx.fillStyle = shade(wood, -0.2);
      ctx.fillRect(0, -hw, L, hw * 2);
      // the grain runs along the piece, since the pattern turns with the stretch
      ctx.fillStyle = patternAt('wood', 0.1, -12.8) || wood;
      ctx.fillRect(0, -hw + 1.2, L, hw * 2 - 2.4);
      const paintOff = (x0, x1) => {
        ctx.fillStyle = shade(POINTS_OFF, -0.2);
        ctx.fillRect(x0, -hw, x1 - x0, hw * 2);
        ctx.fillStyle = POINTS_OFF;
        ctx.fillRect(x0, -hw + 1.2, x1 - x0, hw * 2 - 2.4);
      };
      if (off.has(`${s.a.id}|${s.b.id}`)) paintOff(0, L / 2);
      if (off.has(`${s.b.id}|${s.a.id}`)) paintOff(L / 2, L);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.fillRect(0, -1, L, 2);
      ctx.fillStyle = 'rgba(45, 25, 10, 0.5)';
      ctx.fillRect(0, -5.2, L, 2.6);
      ctx.fillRect(0, 2.6, L, 2.6);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.fillRect(0, -2.6, L, 0.8);
      ctx.fillRect(0, 5.2, L, 0.8);
      // joints between pieces: a seam and the round peg that holds them
      const pieces = Math.max(1, segmentPieces(s.a.id, s.b.id).track);
      for (let k = 1; k < pieces; k++) {
        const x = (L * k) / pieces;
        ctx.fillStyle = 'rgba(45, 25, 10, 0.5)';
        ctx.fillRect(x - 0.6, -hw, 1.2, hw * 2);
        ctx.fillStyle = wood;
        ctx.beginPath(); ctx.arc(x + 2.2, 0, 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(45, 25, 10, 0.45)';
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }
      if (doomed === s.line) {
        ctx.strokeStyle = 'rgba(255, 244, 220, 0.95)';
        ctx.lineWidth = 3;
        ctx.strokeRect(-1, -hw - 1.5, L + 2, hw * 2 + 3);
      }
      if (!running.has(s.a.id)) {
        // No train runs here yet: stripe it pale so it reads as unfinished.
        ctx.strokeStyle = 'rgba(255, 248, 236, 0.85)';
        ctx.lineWidth = 3;
        ctx.setLineDash([9, 9]);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L, 0); ctx.stroke();
      }
      ctx.restore();
    });
    ctx.restore();
  }

  // One label per stretch of joined-up track that no train can reach.
  function drawLineWarnings() {
    const running = stationsWithTrains();
    const said = new Set();
    lines.forEach((line) => {
      const pts = linePathPoints(line);
      if (pts.length < 2 || running.has(pts[0].id) || said.has(pts[0].id)) return;
      // mark everything joined to this line as already labelled
      const q = [pts[0].id];
      said.add(pts[0].id);
      for (let qi = 0; qi < q.length; qi++) for (const o of rb.routing.adj.get(q[qi]) || []) if (!said.has(o)) { said.add(o); q.push(o); }
      const a = pts[0], b = pts[1];
      drawWorldLabel('no train yet', (a.x + b.x) / 2, (a.y + b.y) / 2 - 18, '#c1602f');
    });
  }

  // A plank bridge where a stretch of track crosses the stream.
  function drawBridges() {
    const lanes = laneMap();
    rb.state.bridges.forEach((key) => {
      const [aId, bId] = key.split('|').map(Number);
      const a = stationById(aId), b = stationById(bId);
      if (!a || !b) return;
      // Where this stretch of track actually meets the river — the two
      // stations' own midpoint is very often nowhere near the real crossing,
      // since the river bends and the track usually doesn't cross it square on.
      // A stretch that meets the river more than once has a bridge at each.
      const river = rb.state.river;
      riverCrossings(a, b).forEach((cross) => {
        const seg = cross.seg;
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const rAng = Math.atan2(river[seg + 1].y - river[seg].y, river[seg + 1].x - river[seg].x);
        const len = Math.min(140, (RIVER_HALFWIDTH * 2 + 30) / Math.max(0.35, Math.abs(Math.sin(ang - rAng))));
        const lanesHere = (lanes.get(key) || []).length || 1;
        const half = (lanesHere * TRACK_W) / 2 + 7;
        ctx.save();
        ctx.translate(cross.x, cross.y);
        ctx.rotate(ang);
        ctx.fillStyle = 'rgba(20, 50, 80, 0.35)';
        ctx.fillRect(-len / 2 + 4, -half + 6, len, half * 2);
        const img = sprites.bridge;
        if (img) {
          // Amber's bridge: its deck is the middle ~45% of the picture, between
          // the bead rails, so size it until the deck spans the track it carries.
          const bh = (half * 2) / 0.62, bw = len + 22;
          ctx.drawImage(img, -bw / 2, -bh / 2, bw, bh);
          ctx.restore();
          return;
        }
        const planks = Math.round(len / 7);
        for (let i = 0; i < planks; i++) {
          ctx.fillStyle = i % 2 ? WOOD.mid : shade(WOOD.mid, 0.12);
          ctx.fillRect(-len / 2 + (i * len) / planks, -half, len / planks + 0.5, half * 2);
        }
        ctx.fillStyle = 'rgba(80, 50, 25, 0.35)';
        for (let i = 1; i < planks; i++) ctx.fillRect(-len / 2 + (i * len) / planks - 0.4, -half, 0.8, half * 2);
        // side rails and their posts
        [-half, half].forEach((y) => {
          ctx.fillStyle = WOOD.edge;
          roundRect(ctx, -len / 2 - 3, y - 3, len + 6, 6, 3); ctx.fill();
          ctx.fillStyle = shade(WOOD.dark, 0.2);
          roundRect(ctx, -len / 2 - 3, y - 3, len + 6, 3.4, 2); ctx.fill();
          for (let x = -len / 2; x <= len / 2 + 0.1; x += len / 3) {
            ctx.fillStyle = WOOD.edge;
            ctx.beginPath(); ctx.arc(x, y, 3.6, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = WOOD.light;
            ctx.beginPath(); ctx.arc(x - 0.8, y - 0.8, 1.6, 0, Math.PI * 2); ctx.fill();
          }
        });
        ctx.restore();
      });
    });
  }

  // ----- stations -----

  // The platform as drawn: a planked rectangle, wider and deeper per upgrade.
  // The station building stands on its back half; people wait on the front.
  function platformRect(level) {
    return { hw: platformRadius(level) + 4, y0: -26 - level * 4, y1: 25 + level * 4 };
  }
  // Top of the station building (the clock tower adds a little), where the
  // name board stands.
  // With Amber's sprites it's the top of that type's building.
  function roofTop(level, type) {
    const img = type && sprites[`station-${type}`];
    if (img) return 3 + img.height * SPRITE_SCALE.station * (1 + level * 0.12);
    return 35 + (level >= 2 ? 10 : 0);
  }

  function platformPath(p, x = 0, y = 0) {
    roundRect(ctx, x - p.hw, y + p.y0, p.hw * 2, p.y1 - p.y0, 6);
  }

  // The Station tool over a station that's already placed: the bigger
  // platform it would get, and what that takes from the toy box.
  function drawUpgradeGhost(s) {
    const u = upgradeInfo(s);
    let text, color, below;
    ctx.save();
    ctx.lineWidth = 3 / camera.scale;
    if (u.full) {
      const p = platformRect(s.level);
      ctx.strokeStyle = 'rgba(255,248,236,0.85)';
      below = p.y1 + 4;
      roundRect(ctx, s.x - p.hw - 4, s.y + p.y0 - 4, p.hw * 2 + 8, p.y1 - p.y0 + 8, 8); ctx.stroke();
      text = 'Biggest platform already'; color = '#3a2c1c';
    } else {
      // A see-through version of the platform it would get, between the
      // station's current edge and its new one, with a dashed outline.
      const pn = platformRect(s.level + 1), pc = platformRect(s.level);
      below = pn.y1 + 2;
      const pulse = 0.75 + 0.25 * Math.sin(performance.now() / 260);
      ctx.beginPath();
      ctx.rect(s.x - pn.hw, s.y + pn.y0, pn.hw * 2, pn.y1 - pn.y0);
      ctx.rect(s.x - pc.hw, s.y + pc.y0, pc.hw * 2, pc.y1 - pc.y0);
      ctx.fillStyle = u.ok ? `rgba(217,168,100,${0.8 * pulse})` : `rgba(193,96,47,${0.45 * pulse})`;
      ctx.fill('evenodd');
      ctx.setLineDash([7, 5]);
      ctx.strokeStyle = u.ok ? 'rgba(255,248,236,0.95)' : 'rgba(193,96,47,0.95)';
      roundRect(ctx, s.x - pn.hw - 2, s.y + pn.y0 - 2, pn.hw * 2 + 4, pn.y1 - pn.y0 + 4, 7); ctx.stroke();
      // and the further reach it would get, outside the current ring
      ctx.lineWidth = 2.5 / camera.scale;
      ctx.setLineDash([12 / camera.scale, 8 / camera.scale]);
      ctx.beginPath(); ctx.arc(s.x, s.y, STATION_RANGE[s.level + 1], 0, Math.PI * 2); ctx.stroke();
      const gain = rb.state.houses.filter((h) => !feeds(s, h) && dist(h, s) < STATION_RANGE[s.level + 1] && sameBank(h, s)).length;
      text = u.ok
        ? `Upgrade: room for ${u.to} (now ${u.from}), +${gain} ${gain === 1 ? 'house' : 'houses'} in reach · ${u.cost} ${invName('stations', u.cost)}`
        : `Upgrade needs ${u.cost} ${invName('stations', u.cost)} — you have ${rb.state.inv.stations}`;
      color = u.ok ? '#2c4a39' : '#c1602f';
    }
    ctx.restore();
    // below the station, so it never sits on top of the name board
    drawWorldLabel(text, s.x, s.y + below + 14 / camera.scale, color, 13);
  }

  // A wooden platform with a little station building on it: roof painted in
  // the station's colour, its emblem on a badge, a striped awning over the
  // door. Upgrades make the platform bigger, add benches, then a clock tower.
  function drawStation(s) {
    const lv = s.level;
    const p = platformRect(lv);
    const color = TYPES[s.type].color;
    ctx.save();
    ctx.translate(s.x, s.y);

    // platform: shadow, the thickness of its front edge, then the planked top
    ctx.fillStyle = 'rgba(25, 45, 20, 0.32)';
    platformPath(p, 4, 6); ctx.fill();
    ctx.fillStyle = WOOD.edge;
    platformPath(p, 0, 3); ctx.fill();
    const g = ctx.createLinearGradient(0, p.y0, 0, p.y1);
    g.addColorStop(0, WOOD.light);
    g.addColorStop(1, WOOD.mid);
    ctx.fillStyle = patternAt('wood', 0.12) || g;
    platformPath(p); ctx.fill();
    ctx.save();
    platformPath(p); ctx.clip();
    ctx.fillStyle = 'rgba(110, 72, 36, 0.28)';
    for (let y = p.y0 + 7; y < p.y1; y += 7) ctx.fillRect(-p.hw, y, p.hw * 2, 0.9);
    ctx.restore();
    // a painted edge in the station's colour, so its type reads from afar
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.6;
    roundRect(ctx, -p.hw + 3, p.y0 + 3, p.hw * 2 - 6, p.y1 - p.y0 - 6, 4); ctx.stroke();

    if (lv >= 1) {
      // benches either side of the building
      [-1, 1].forEach((side) => {
        const bx = side * (p.hw - 10);
        ctx.fillStyle = WOOD.edge;
        ctx.fillRect(bx - 5, -9, 10, 5);
        ctx.fillStyle = WOOD.dark;
        ctx.fillRect(bx - 5, -11, 10, 3);
      });
    }

    const img = sprites[`station-${s.type}`];
    if (img) {
      // Amber's building for this type, standing on the back of the platform
      const k = SPRITE_SCALE.station * (1 + lv * 0.12);
      const w = img.width * k, ht = img.height * k;
      ctx.fillStyle = 'rgba(25, 45, 20, 0.25)';
      roundRect(ctx, -w / 2 + 4, -8, w, 8, 3); ctx.fill();
      ctx.drawImage(img, -w / 2, 1 - ht, w, ht);
      ctx.restore();
    } else {
      // the station building
      const bw = 17 + lv * 3;
      ctx.fillStyle = 'rgba(25, 45, 20, 0.25)';
      ctx.fillRect(-bw + 3, -14, bw * 2, 12);
      ctx.fillStyle = '#fbf1dc';
      ctx.fillRect(-bw, -16, bw * 2, 13);
      ctx.fillStyle = 'rgba(90, 60, 30, 0.12)';
      ctx.fillRect(bw - 6, -16, 6, 13);
      ctx.fillStyle = '#9a6536';
      roundRect(ctx, -3.5, -12, 7, 9, 3); ctx.fill();
      ctx.fillStyle = '#a9d3e8';
      ctx.fillRect(-bw + 4, -12.5, 5, 4.5);
      ctx.fillRect(bw - 9, -12.5, 5, 4.5);
      // roof, lit on its near slope
      ctx.fillStyle = shade(color, -0.22);
      ctx.beginPath(); ctx.moveTo(-bw - 4, -15); ctx.lineTo(bw + 4, -15); ctx.lineTo(bw - 3, -35); ctx.lineTo(-bw + 3, -35); ctx.closePath(); ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(-bw - 4, -15); ctx.lineTo(bw + 4, -15); ctx.lineTo(bw + 0.5, -25); ctx.lineTo(-bw - 0.5, -25); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.fillRect(-bw + 3, -35, bw * 2 - 6, 1.8);
      if (lv >= 2) {
        // clock tower
        ctx.fillStyle = '#fbf1dc';
        ctx.fillRect(-6, -45, 12, 12);
        ctx.fillStyle = shade(color, -0.3);
        ctx.beginPath(); ctx.moveTo(-8, -44); ctx.lineTo(8, -44); ctx.lineTo(0, -50); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(0, -39, 4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#3a2c1c';
        ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.moveTo(0, -39); ctx.lineTo(0, -41.8); ctx.moveTo(0, -39); ctx.lineTo(2, -39); ctx.stroke();
      }
      // striped awning over the front
      const aw = bw + 3, stripes = Math.round(aw / 3);
      for (let i = 0; i < stripes; i++) {
        ctx.fillStyle = i % 2 ? '#fff8ec' : color;
        const x = -aw + (i * aw * 2) / stripes;
        ctx.fillRect(x, -5, (aw * 2) / stripes + 0.3, 3.5);
        ctx.beginPath(); ctx.arc(x + aw / stripes, -1.5, aw / stripes, 0, Math.PI); ctx.fill();
      }
      // the emblem: a cream badge on the roof
      ctx.fillStyle = shade(color, -0.35);
      ctx.beginPath(); ctx.arc(0.6, -23.4, 8.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff8ec';
      ctx.beginPath(); ctx.arc(0, -24, 8.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      drawGlyph(s.type, s.x, s.y - 24, 13, color);
    }

    // People waiting on the front of the platform, two rows, back row first.
    const shown = Math.min(s.pegs.length, 8);
    const perRow = 4;
    const gap = Math.min(13, (p.hw * 2 - 12) / perRow);
    const order = [];
    for (let i = 0; i < shown; i++) {
      const back = i >= perRow;
      const k = back ? i - perRow : i;
      const px = s.x + (k - (perRow - 1) / 2) * gap + (back ? gap / 2 : 0);
      const py = s.y + (back ? 9 : 18) + lv * 2;
      order[i] = { i, px, py, back };
    }
    order.sort((a, b) => a.py - b.py).forEach(({ i, px, py }) => {
      const peg = s.pegs[i];
      if (peg.walked) {
        // walked here: an orange ring, red once they're past their patience
        ctx.fillStyle = grumbling(peg) ? 'rgba(210,60,40,0.75)' : 'rgba(240,140,40,0.6)';
        ctx.beginPath(); ctx.arc(px, py - 1, 8.5, 0, Math.PI * 2); ctx.fill();
      }
      drawPeg(px, py, TYPES[peg.type].color, 10);
    });
  }

  // Names and queue counts go on after everything else so no train or house
  // is ever drawn over them.
  function drawStationLabels(s) {
    const p = platformRect(s.level);
    const cap = STATION_BASE_CAP[s.level];
    drawSign(s.name, s.x, s.y - roofTop(s.level, s.type));
    if (s.pegs.length > 8) drawWorldLabel(`+${s.pegs.length - 8}`, s.x, s.y + p.y1 + 12, '#c1602f');
    if (s.pegs.length > cap) drawWorldLabel(`${s.pegs.length} waiting`, s.x, s.y + p.y1 + (s.pegs.length > 8 ? 30 : 12), '#c1602f');
  }

  // ----- trains -----

  function trainPosition(train) {
    const a = stationById(train.at);
    if (!a) return null;
    const b = train.to !== null && !train.atStation ? stationById(train.to) : null;
    if (!b) {
      // standing at a station, facing the way it's about to go (or came)
      const next = train.to !== null ? stationById(train.to) : null;
      const prev = train.prev !== null ? stationById(train.prev) : null;
      const ang = next ? Math.atan2(next.y - a.y, next.x - a.x) : prev ? Math.atan2(a.y - prev.y, a.x - prev.x) : 0;
      return { x: a.x, y: a.y, ang };
    }
    // ride in the lane of the first line laid along this stretch
    const lanes = laneMap();
    const on = lanes.get(edgeKey(a.id, b.id)) || [];
    const o = on.length ? laneOffset(lanes, on[0], a, b) : { x: 0, y: 0 };
    const t = clamp(train.prog, 0, 1);
    return { x: a.x + (b.x - a.x) * t + o.x, y: a.y + (b.y - a.y) * t + o.y, ang: Math.atan2(b.y - a.y, b.x - a.x) };
  }

  // Seen from above: little wheels peeking out each side.
  function drawWheels(x0, x1, half) {
    ctx.fillStyle = '#2a2018';
    [x0, x1].forEach((x) => {
      roundRect(ctx, x - 3, -half - 2.2, 6, 3, 1.2); ctx.fill();
      roundRect(ctx, x - 3, half - 0.8, 6, 3, 1.2); ctx.fill();
    });
  }

  // The train as drawn: an engine and its carriages, each a rigid piece
  // whose front and back both sit on the track behind the engine, so it
  // bends at the couplings round a corner instead of swinging as one stick.
  // Lengths run along the track; the engine's nose is TRAIN_AHEAD in front
  // of the train's position.
  const TRAIN_AHEAD = 14;
  function trainBody(train) {
    const ci = Math.max(0, TRAIN_COLORS.indexOf(train.color || TRAIN_COLORS[0]));
    const loco = sprites[`loco-${ci}`], car = sprites[`car-${ci}`];
    if (loco && car) {
      const ll = (loco.width / loco.height) * LOCO_W, cl = (car.width / car.height) * CAR_W;
      return { loco, car, locoLen: ll, carLen: cl, gap: CAR_GAP };
    }
    return { loco: null, car: null, locoLen: 28, carLen: 22, gap: 4 };
  }
  function trainLength(train) {
    const b = trainBody(train);
    return b.locoLen + train.carriages * (b.carLen + b.gap);
  }

  // The point s along the track behind the train's position (negative is in
  // front of it), from the trail of where it has been.
  function trailPoint(trail, s, ang) {
    if (s <= 0) return { x: trail[0].x - Math.cos(ang) * s, y: trail[0].y - Math.sin(ang) * s };
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1], b = trail[i], d = dist(a, b);
      if (s <= d && d > 0) return { x: a.x + (b.x - a.x) * (s / d), y: a.y + (b.y - a.y) * (s / d) };
      s -= d;
    }
    const n = trail.length, last = trail[n - 1];
    const back = n > 1 ? Math.atan2(last.y - trail[n - 2].y, last.x - trail[n - 2].x) : ang + Math.PI;
    return { x: last.x + Math.cos(back) * s, y: last.y + Math.sin(back) * s };
  }

  // Keeps train.trail, the line its engine has drawn along the track, newest
  // first and only as long as the train. Not saved: a resumed train starts
  // straight and bends again from its first corner.
  function followTrail(train, pos) {
    const len = trainLength(train) + 40;
    let trail = train.trail;
    if (!trail || dist(trail[0], pos) > 60) {
      trail = [{ x: pos.x, y: pos.y }, { x: pos.x - Math.cos(pos.ang) * len, y: pos.y - Math.sin(pos.ang) * len }];
      train.flipsSeen = train.flips || 0;
    }
    if ((train.flips || 0) !== train.flipsSeen) {
      // turned round: the body, nose to tail, reversed where it lay
      train.flipsSeen = train.flips || 0;
      // the new engine stands where the old tail was, its own nose a little
      // further on; behind it, the old body back to where the old nose was
      const D = Math.max(0, trainLength(train) - 2 * TRAIN_AHEAD), pts = [];
      for (let k = 0; k <= 24; k++) pts.push(trailPoint(trail, -TRAIN_AHEAD + ((D + TRAIN_AHEAD) * k) / 24, train.heading));
      pts.reverse();
      trail = [{ x: pos.x, y: pos.y }].concat(pts.slice(1));
    }
    if (dist(trail[1], pos) >= 3) trail.unshift({ x: pos.x, y: pos.y }); else trail[0] = { x: pos.x, y: pos.y };
    // trim to length
    let run = 0;
    for (let i = 1; i < trail.length; i++) {
      run += dist(trail[i - 1], trail[i]);
      if (run > len) { trail.length = i + 1; break; }
    }
    train.trail = trail;
    // which way the nose points: the way it's moving, and while it stands,
    // the way it was last moving (not the way it's about to go)
    if (!train.atStation || train.heading === undefined) train.heading = pos.ang;
  }

  // Where each piece goes: centre, angle and length, engine first.
  function trainPieces(train, body) {
    const out = [];
    let s = -TRAIN_AHEAD;
    const place = (len, kind) => {
      const f = trailPoint(train.trail, s, train.heading), b = trailPoint(train.trail, s + len, train.heading);
      out.push({ kind, len, x: (f.x + b.x) / 2, y: (f.y + b.y) / 2, ang: Math.atan2(f.y - b.y, f.x - b.x) });
      s += len + body.gap;
    };
    place(body.locoLen, 'loco');
    for (let c = 0; c < train.carriages; c++) place(body.carLen, 'car');
    return out;
  }

  function drawTrain(train) {
    const pos = trainPosition(train);
    if (!pos) return;
    followTrail(train, pos);
    const body = trainBody(train);
    const pieces = trainPieces(train, body);
    const color = train.color || TRAIN_COLORS[0];
    // shadows first, cast down-right whichever way each piece faces
    ctx.fillStyle = 'rgba(25, 45, 20, 0.32)';
    pieces.forEach((p) => {
      ctx.save();
      ctx.translate(p.x + 3, p.y + 4);
      ctx.rotate(p.ang);
      roundRect(ctx, -p.len / 2 - 1, -8.5, p.len + 2, 17, 5); ctx.fill();
      ctx.restore();
    });
    // back to front, so the engine sits on top at the couplings
    for (let i = pieces.length - 1; i >= 0; i--) {
      const p = pieces[i];
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.ang);
      if (body.loco) {
        const img = p.kind === 'loco' ? body.loco : body.car, h = p.kind === 'loco' ? LOCO_W : CAR_W;
        ctx.drawImage(img, -p.len / 2, -h / 2, p.len, h);
        if (p.kind === 'loco') drawSteam(train, p.len * 0.1);
      } else if (p.kind === 'loco') drawEngine(color, train);
      else drawCarriage(color);
      ctx.restore();
    }
  }

  // The canvas engine and carriage, centred on 0 and facing +x, for when
  // Amber's painted ones haven't loaded.
  function drawCarriage(body) {
    ctx.fillStyle = '#2a2018';
    ctx.beginPath(); ctx.arc(12.5, 0, 2, 0, Math.PI * 2); ctx.fill();   // coupling
    drawWheels(-6, 6, 8);
    const paint = shade(body, 0.22);
    ctx.fillStyle = shade(paint, -0.22);
    roundRect(ctx, -11, -8, 22, 16, 4); ctx.fill();
    ctx.fillStyle = paint;
    roundRect(ctx, -11, -8, 22, 14.5, 4); ctx.fill();
    // the roof, and a row of windows down each side
    ctx.fillStyle = shade(paint, 0.4);
    roundRect(ctx, -8.5, -4.5, 17, 8, 3); ctx.fill();
    ctx.fillStyle = 'rgba(40, 60, 80, 0.55)';
    for (let k = -1; k <= 1; k++) { ctx.fillRect(k * 5.5 - 1.8, -7, 3.6, 1.8); ctx.fillRect(k * 5.5 - 1.8, 4.4, 3.6, 1.6); }
  }
  function drawEngine(body, train) {
    // cab behind, boiler in front, chimney on top
    ctx.translate(-14, 0);
    drawWheels(5, 19, 9);
    ctx.fillStyle = shade(body, -0.3);
    roundRect(ctx, 0, -9, 26, 18, 4); ctx.fill();
    ctx.fillStyle = body;
    roundRect(ctx, 0, -9, 11, 17, 3); ctx.fill();
    ctx.fillStyle = shade(body, 0.3);
    roundRect(ctx, 1.5, -6.5, 8, 12, 2); ctx.fill();
    const boiler = ctx.createLinearGradient(0, -6.5, 0, 6.5);
    boiler.addColorStop(0, shade(body, -0.1));
    boiler.addColorStop(0.4, shade(body, 0.3));
    boiler.addColorStop(1, shade(body, -0.2));
    ctx.fillStyle = boiler;
    roundRect(ctx, 10, -6.5, 16, 13, 6); ctx.fill();
    ctx.fillStyle = '#e0ac2a';
    ctx.fillRect(14.5, -6.5, 1.6, 13);
    ctx.fillStyle = '#2a2018';
    ctx.fillRect(26, -6, 2.4, 12);
    ctx.beginPath(); ctx.arc(21, 0, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#e0ac2a';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    drawSteam(train, 21);
  }

  // steam from the chimney at x, only while it's moving
  function drawSteam(train, x) {
    if (train.atStation !== null || rb.state.speedIdx === 0) return;
    const now = performance.now() / 1000;
    for (let k = 0; k < 3; k++) {
      const ph = (now * 1.6 + k / 3) % 1;
      ctx.fillStyle = `rgba(255, 255, 255, ${0.55 * (1 - ph)})`;
      ctx.beginPath(); ctx.arc(x - ph * 34, Math.sin((ph + k) * 5) * 2.5, 3 + ph * 5, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Amber's painted engine and carriages: heights, and the gap between them.
  const LOCO_W = 19, CAR_W = 17, CAR_GAP = 1;

  // The Station tool's ghost: where it would go, how many houses would feed
  // it, and whether it can go there at all.
  function drawStationGhost(p) {
    const why = rb.state.inv.stations < 1 ? 'none left' : whyNotStation(p);
    const n = housesNear(p);
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 2 / camera.scale;
    ctx.strokeStyle = why ? 'rgba(193,96,47,0.55)' : 'rgba(255,248,236,0.75)';
    ctx.beginPath(); ctx.arc(p.x, p.y, DENSITY_R, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = why ? '#c1602f' : WOOD.light;
    platformPath(platformRect(0), p.x, p.y); ctx.fill();
    ctx.strokeStyle = why ? '#8a3a1a' : WOOD.edge;
    ctx.lineWidth = 2;
    ctx.stroke();
    // the building's outline, so it reads as a station before it's placed
    // its roof is already painted the colour it will be
    const next = TYPES[nextStationType()];
    if (!why) ctx.fillStyle = next.color;
    ctx.beginPath(); ctx.moveTo(p.x - 21, p.y - 15); ctx.lineTo(p.x + 21, p.y - 15); ctx.lineTo(p.x + 14, p.y - 35); ctx.lineTo(p.x - 14, p.y - 35); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    drawWorldLabel(why ? (why === 'none left' ? 'No stations left' : why)
      : `${COLOUR_NAMES[nextStationType()]} station · ${n} ${n === 1 ? 'house' : 'houses'} nearby`,
      p.x, p.y - roofTop(0) - 16, why ? '#c1602f' : '#2c4a39', 13);
  }

  // A draft of track not yet laid: see-through wooden pieces.
  function draftStroke(pts) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.strokeStyle = 'rgba(240, 210, 157, 0.6)';
    ctx.lineWidth = TRACK_W;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(90, 60, 30, 0.6)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 7]);
    ctx.stroke();
    ctx.restore();
  }

  // The station picked out with no tool in hand (null when none is).
  let selectedId = null;
  function selectStation(id) { selectedId = id; }

  // Its catchment: the ring of houses close enough to feed it, each of those
  // lit up in gold, and the houses further out that walk in to it ringed in
  // orange with a dotted footpath to the platform.
  function drawCatchment(s) {
    const pulse = 0.75 + 0.25 * Math.sin(performance.now() / 300);
    const far = walkersFor(s);
    ctx.save();
    const R = stationRange(s);
    const g = ctx.createRadialGradient(s.x, s.y, R * 0.2, s.x, s.y, R);
    g.addColorStop(0, 'rgba(255, 236, 170, 0.08)');
    g.addColorStop(1, 'rgba(255, 236, 170, 0.3)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(s.x, s.y, R, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 3 / camera.scale;
    ctx.strokeStyle = 'rgba(255, 244, 205, 0.95)';
    ctx.setLineDash([10 / camera.scale, 7 / camera.scale]);
    ctx.stroke();
    ctx.lineWidth = 1.8 / camera.scale;
    ctx.strokeStyle = 'rgba(240, 140, 40, 0.75)';
    ctx.setLineDash([4 / camera.scale, 5 / camera.scale]);
    far.forEach((h) => { ctx.beginPath(); ctx.moveTo(h.x, h.y + 6); ctx.lineTo(s.x, s.y); ctx.stroke(); });
    ctx.setLineDash([]);
    const ring = (h, rgb) => {
      const gl = ctx.createRadialGradient(h.x, h.y + 3, 4, h.x, h.y + 3, 22);
      gl.addColorStop(0, `rgba(${rgb}, ${0.55 * pulse})`);
      gl.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = gl;
      ctx.beginPath(); ctx.arc(h.x, h.y + 3, 22, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(${rgb}, 0.95)`;
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.ellipse(h.x + 1, h.y + 5, 18, 12, 0, 0, Math.PI * 2); ctx.stroke();
    };
    rb.state.houses.forEach((h) => { if (feeds(s, h)) ring(h, '255, 211, 90'); });
    far.forEach((h) => ring(h, '240, 140, 40'));
    ctx.restore();
  }
  function drawCatchmentLabel(s) {
    const near = stationHouses(s), far = walkersFor(s).length;
    const text = `${near} ${near === 1 ? 'house' : 'houses'} close by` + (far ? ` · ${far} walk in` : '')
      + ` · ${s.pegs.length}/${STATION_BASE_CAP[s.level]} waiting`;
    drawWorldLabel(text, s.x, s.y + stationRange(s), '#2c4a39', 13);
  }

  function draw() {
    ctx.fillStyle = '#3f6e3c';
    ctx.fillRect(0, 0, canvasCW, canvasCH);

    ctx.save();
    ctx.translate(canvasCW / 2, canvasCH / 2);
    ctx.scale(camera.scale, camera.scale);
    ctx.translate(-camera.cx, -camera.cy);

    drawMat();

    // Ground under each neighbourhood, nothing at all until its first house
    // goes up. A served one gets a soft gold "settled" tint. One with no
    // station, or only a station with no track, glows orange instead, going
    // red as it grows — the bigger the town you're ignoring, the louder it is.
    const pulse = 0.85 + 0.15 * Math.sin(performance.now() / 450);
    rb.state.neighborhoods.forEach((n) => {
      if (!n.count) return;
      const r = neighbourhoodRadius(n);
      const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 1.15);
      if (neighbourhoodService(n) === 'served') {
        grad.addColorStop(0, `rgba(217, 158, 43, ${Math.min(0.3, 0.06 + n.count * 0.012)})`);
        grad.addColorStop(1, 'rgba(217, 158, 43, 0)');
      } else {
        const t = clamp(n.count / 25, 0, 1);            // orange → red with size
        const rgb = `${Math.round(240 - 30 * t)}, ${Math.round(140 - 90 * t)}, ${Math.round(40 - 5 * t)}`;
        const a = (0.3 + 0.2 * t) * pulse;
        grad.addColorStop(0, `rgba(${rgb}, ${a})`);
        grad.addColorStop(0.55, `rgba(${rgb}, ${a * 0.6})`);
        grad.addColorStop(1, `rgba(${rgb}, 0)`);
      }
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(n.x, n.y, r * 1.15, 0, Math.PI * 2); ctx.fill();
    });
    // A station with no track through it gets its own warning halo.
    stations.forEach((s) => {
      if (isConnected(s)) return;
      const r = STATION_WORLD_R * 2.6;
      const grad = ctx.createRadialGradient(s.x, s.y, STATION_WORLD_R * 0.6, s.x, s.y, r);
      grad.addColorStop(0, `rgba(215, 70, 40, ${0.45 * pulse})`);
      grad.addColorStop(1, 'rgba(215, 70, 40, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
    });

    drawRiver();
    drawMatEdge();

    if (selectedId !== null && !stationById(selectedId)) selectedId = null;
    // Hovering a station shows its catchment too, over whichever is picked.
    const hovered = hover && !rb.draft && !dragMode && armedFrom === null ? stationAt(hover) : null;
    const picked = hovered || (selectedId !== null ? stationById(selectedId) : null);
    if (picked) drawCatchment(picked);

    // Trees and houses stand up off the mat, so the ones further down the
    // mat are nearer the viewer and go on last.
    const standing = rb.state.trees.map((t) => ({ y: t.y, t })).concat(rb.state.houses.map((h) => ({ y: h.y, h })));
    standing.sort((a, b) => a.y - b.y);
    standing.forEach((o) => (o.t ? drawTree(o.t) : drawToyHouse(o.h)));

    drawBridges();
    drawTracks();

    if (rb.draft) {
      const pts = rb.draft.stations.map(stationById).filter(Boolean);
      if (rb.draft.cursor) pts.push(rb.draft.cursor);
      if (pts.length > 1) draftStroke(pts);
    }

    const armed = armedFrom !== null && rb.state.tool === 'track' ? stationById(armedFrom) : null;
    const armedTo = armed && hover ? stationAt(hover) : null;
    if (armed) {
      const pulseR = 3 * Math.sin(performance.now() / 200);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,248,236,0.95)';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(armed.x, armed.y, platformRadius(armed.level) + 9 + pulseR, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      if (hover) draftStroke([armed, armedTo && armedTo !== armed ? armedTo : hover]);
    }

    // People on foot, heading for the nearest station.
    rb.state.walkers.forEach((w) => {
      if (!stationById(w.stationId)) return;
      const p = walkerPosition(w);
      drawPeg(p.x, p.y + Math.abs(Math.sin(w.t * 9)) * -2, TYPES[w.type].color, 9);
    });

    stations.forEach(drawStation);
    trains.forEach(drawTrain);
    if (rb.state.tool === 'station' && hover && !rb.draft) {
      const over = stationAt(hover);
      if (over) drawUpgradeGhost(over); else drawStationGhost(hover);
    }

    stations.forEach(drawStationLabels);
    if (picked) drawCatchmentLabel(picked);
    drawLineWarnings();
    trains.forEach((t) => {
      if (!t.pegs.length) return;
      const pos = trainPosition(t);
      if (pos) drawWorldLabel(String(t.pegs.length), pos.x, pos.y - 22, '#3a2c1c', 11);
    });
    if (rb.draft && rb.draft.cursor && rb.draft.stations.length) {
      // What the drag so far would cost, following the pointer.
      const ids = rb.draft.stations.slice();
      const loop = ids.length >= 3 && ids[ids.length - 1] === ids[0];
      const need = costOf(draftSegments(loop ? ids.slice(0, -1) : ids, loop));
      if (need.track) {
        const text = `${need.track} / ${rb.state.inv.track} track` + (need.bridges ? ` · ${need.bridges} / ${rb.state.inv.bridges} ${invName('bridges', need.bridges)}` : '');
        drawWorldLabel(text, rb.draft.cursor.x, rb.draft.cursor.y - 26, affordable(need) ? '#2c4a39' : '#c1602f', 13);
      }
    }
    if (armed && armedTo && armedTo !== armed) {
      const need = costOf([segmentPieces(armed.id, armedTo.id)]);
      const text = `${need.track} / ${rb.state.inv.track} track` + (need.bridges ? ` · ${need.bridges} / ${rb.state.inv.bridges} ${invName('bridges', need.bridges)}` : '');
      drawWorldLabel(text, hover.x, hover.y - 26, affordable(need) ? '#2c4a39' : '#c1602f', 13);
    }
    fx.forEach((f) => { ctx.save(); ctx.globalAlpha = clamp(f.life, 0, 1); drawWorldLabel(f.text, f.x, f.y, f.color); ctx.restore(); });

    ctx.restore();
  }

  // ---------- speech bubbles ----------

  const bubbleHost = $('#bubbles');
  const bubbleEls = new Map();
  function updateBubbles() {
    const worst = stations
      .filter((s) => s.pegs.length > STATION_BASE_CAP[s.level] && rb.state.mode !== 'calm')
      .sort((a, b) => b.pegs.length - a.pegs.length)
      .slice(0, 4);
    const keep = new Set(worst.map((s) => s.id));
    bubbleEls.forEach((el, id) => { if (!keep.has(id)) { el.classList.remove('is-on'); setTimeout(() => el.remove(), 260); bubbleEls.delete(id); } });
    worst.forEach((s) => {
      let el = bubbleEls.get(s.id);
      if (!el) { el = document.createElement('div'); el.className = 'bubble'; bubbleHost.appendChild(el); bubbleEls.set(s.id, el); requestAnimationFrame(() => el.classList.add('is-on')); }
      const p = worldToScreen(s.x, s.y);
      el.style.left = `${p.x}px`;
      // above the station's name board, which grows a little with the zoom
      const signTop = worldToScreen(s.x, s.y - roofTop(s.level, s.type)).y - clamp(9 + camera.scale * 4, 11, 17) - 16;
      el.style.top = `${signTop - 22}px`;
      el.textContent = `${s.name}: ${s.pegs.length} waiting!`;
    });
  }

  // ---------- HUD ----------

  const shown = {};
  function setText(sel, v) {
    const s = String(v);
    if (shown[sel] === s) return;
    shown[sel] = s;
    const el = $(sel);
    if (el) el.textContent = s;
  }

  function pulseInventory(item) {
    document.querySelectorAll(`[data-inv="${item}"]`).forEach((el) => {
      el.classList.remove('pulse');
      void el.offsetWidth; // restart the animation
      el.classList.add('pulse');
    });
  }

  let lastListUpdate = -1;
  function updateHUD() {
    setText('#hud-happy', `${Math.round(rb.state.happiness)}%`);
    $('#hud-happy').closest('.stat').classList.toggle('is-low', rb.state.happiness < 30);
    setText('#hud-houses', rb.state.houses.length);
    setText('#hud-week', rb.state.week);
    setText('#hud-day', rb.state.day);
    $('#hud-daybar').style.width = `${clamp((rb.state.time / DAY_LEN) * 100, 0, 100)}%`;

    Object.keys(INV_NAMES).forEach((item) => {
      setText(`#tb-${item}`, rb.state.inv[item]);
      setText(`#inv-${item}`, rb.state.inv[item]);
    });
    setText('#inv-carriages-sub', `+${rb.state.inv.carriages} ${invName('carriages', rb.state.inv.carriages)}`);
    setText('#inv-bridges-sub', `+${rb.state.inv.bridges} ${invName('bridges', rb.state.inv.bridges)}`);
    document.querySelectorAll('.tool[data-need]').forEach((btn) => {
      btn.classList.toggle('is-empty', rb.state.inv[btn.dataset.need] < 1);
    });
    const ng = nextGift();
    setText('#tb-next', ng ? `Next: +${ng.g.amount} ${invName(ng.g.item, ng.g.amount)} at ${ng.at} houses built` : '');

    if (Math.abs(rb.state.totalTime - lastListUpdate) > 0.4) {
      lastListUpdate = rb.state.totalTime;
      const ol = $('#stationlist');
      ol.innerHTML = '';
      if (!stations.length) {
        const li = document.createElement('li');
        li.className = 'is-hint';
        li.textContent = 'No stations yet — pick Station and click where the houses are going up.';
        ol.appendChild(li);
      }
      stations.slice().sort((a, b) => b.pegs.length - a.pegs.length).forEach((s) => {
        const li = document.createElement('li');
        const cap = STATION_BASE_CAP[s.level];
        if (s.pegs.length > cap) li.classList.add('is-full');
        if (s.id === selectedId) li.classList.add('is-selected');
        li.dataset.id = s.id;
        li.title = 'Show the houses that use it';
        li.innerHTML = `<i class="dot" style="background:${TYPES[s.type].color}"></i><span class="name">${s.name}</span><span class="wait">${s.pegs.length}</span>`;
        ol.appendChild(li);
      });
    }
  }

  // A name in the list picks that station out and brings it into view.
  $('#stationlist').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    const s = stationById(Number(li.dataset.id));
    if (!s) return;
    setTool(null);
    selectStation(s.id);
    camera.manual = true;
    camera.cx = s.x; camera.cy = s.y;
    clampCamera();
    lastListUpdate = -1;
  });

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('is-on'));
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.classList.remove('is-on'); setTimeout(() => { el.hidden = true; }, 220); }, 2600);
  }

  // ---------- input ----------

  let hover = null; // world point under the pointer, for the Station ghost
  // Click-to-connect: a click (no drag) on a station with the Track tool arms
  // it, and the next station clicked is joined to it. The joined station is
  // armed in turn, so a line can be laid click by click. Open grass, the same
  // station again, Esc or another tool puts it down.
  let armedFrom = null;

  function connectClick(s) {
    const from = armedFrom;
    beginDraft(from);
    tryAppendDraft(s.id);
    commitDraft();
    const joined = lines.some((l) => {
      const ids = l.stationIds;
      return ids.some((id, i) => id === s.id && (ids[i - 1] === from || ids[i + 1] === from));
    });
    armedFrom = joined ? s.id : null;
  }

  function eventToWorld(e) {
    const rect = canvas.getBoundingClientRect();
    return screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  }
  // Every hit-test below adds CLICK_FORGIVE_PX worth of extra room, converted
  // to world units at the CURRENT zoom — so the target stays about as easy to
  // hit whether the camera is zoomed all the way in or all the way out.
  function forgive() { return CLICK_FORGIVE_PX / camera.scale; }
  function stationAt(p) { return stations.find((s) => dist(s, p) < STATION_WORLD_R + forgive()); }
  function trainAt(p) {
    return trains.find((t) => {
      const pos = trainPosition(t);
      return pos && Math.hypot(p.x - pos.x, p.y - pos.y) < TRAIN_HIT_R + forgive();
    });
  }
  function lineAt(p) {
    // measured to each line's own lane, so side-by-side lines can be told apart
    let best = null, bestD = 14 + forgive();
    trackStretches().forEach((s) => {
      const d = pointSegDist(p, { x: s.ax, y: s.ay }, { x: s.bx, y: s.by }).dist;
      if (d < bestD) { bestD = d; best = s.line; }
    });
    return best;
  }

  // A single pointer is ever doing one of two things: dragging out a length of
  // track, or — whenever the tool in hand found nothing to act on right where
  // the pointer went down — panning the mat instead of doing nothing at all.
  let dragMode = null; // { kind: 'draft' } | { kind: 'pan', x, y }

  canvas.addEventListener('pointerdown', (e) => {
    if (!rb.state || rb.state.gameOver) return;
    const p = eventToWorld(e);
    let handled = false;
    if (rb.state.tool === 'track') {
      const s = stationAt(p);
      if (armedFrom !== null) {
        if (s && s.id !== armedFrom && stationById(armedFrom)) connectClick(s);
        else armedFrom = null;
        handled = true;
      } else if (s) { beginDraft(s.id); dragMode = { kind: 'draft' }; handled = true; }
    } else if (rb.state.tool === 'station') {
      const s = stationAt(p);
      if (s) upgradeStation(s);
      else placeStation(p);
      handled = true; // placing already says why when it can't
    } else if (rb.state.tool === 'train') {
      const t = trainAt(p);
      if (t) { addCarriage(t); handled = true; } else {
        const l = lineAt(p);
        if (l) { placeTrain(l, p); handled = true; } else toast('Click a line to put a train on it, or a train to hitch a carriage.');
      }
    } else if (!rb.state.tool) {
      // no tool in hand: a click on a station picks it out, showing its catchment
      const s = stationAt(p);
      if (s) { selectStation(selectedId === s.id ? null : s.id); handled = true; }
    } else if (rb.state.tool === 'remove') {
      const t = trainAt(p);
      const s = t ? null : stationAt(p);
      const l = t || s ? null : lineAt(p);
      if (t) removeTrain(t);
      else if (s) removeStation(s);
      else if (l) removeLine(l);
      else toast('Click a train, a line or a station to put it back in the toy box.');
      handled = !!(t || s || l);
    }
    // a pan that turns out to be a click on the grass drops the picked station
    if (!handled) { dragMode = { kind: 'pan', x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY }; }
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic event */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch') {
      hover = eventToWorld(e);
      canvas.style.cursor = !rb.state.tool && !dragMode && stationAt(hover) ? 'pointer' : '';
    }
    if (!dragMode) return;
    if (dragMode.kind === 'draft') {
      const p = eventToWorld(e);
      rb.draft.cursor = p;
      const s = stationAt(p);
      if (s) tryAppendDraft(s.id);
    } else if (dragMode.kind === 'pan') {
      const dx = e.clientX - dragMode.x, dy = e.clientY - dragMode.y;
      if (dx || dy) camera.manual = true;
      camera.cx -= dx / camera.scale;
      camera.cy -= dy / camera.scale;
      clampCamera();
      dragMode.x = e.clientX; dragMode.y = e.clientY;
    }
  });
  canvas.addEventListener('pointerleave', () => { hover = null; });
  function endDrag(e) {
    if (dragMode && dragMode.kind === 'draft' && rb.draft) {
      if (rb.draft.stations.length < 2) {
        // a click, not a drag: arm the station and wait for the second click
        armedFrom = rb.draft.stations[0];
        rb.draft = null;
        toast('Now click the station to join it to — or drag. Esc to cancel.');
      } else commitDraft();
    }
    if (dragMode && dragMode.kind === 'pan' && Math.hypot(e.clientX - dragMode.sx, e.clientY - dragMode.sy) < 5) selectedId = null;
    dragMode = null;
    if (rb.draft) cancelDraft();
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* not captured */ }
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  // Wheel zooms on whatever world point sits under the cursor, the way a map
  // does, rather than always on the middle of the screen.
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0012));
  }, { passive: false });

  // Pinch-to-zoom: two active touches, tracked by pointer id. While a pinch is
  // live it overrides any single-pointer pan/draft that might also be active.
  const activeTouches = new Map(); // pointerId -> {x,y}
  let pinchDist = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activeTouches.size === 2) {
      dragMode = null;
      rb.draft = null;
      const [a, b] = [...activeTouches.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch' || !activeTouches.has(e.pointerId)) return;
    activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activeTouches.size === 2 && pinchDist) {
      const [a, b] = [...activeTouches.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = canvas.getBoundingClientRect();
      zoomAt((a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top, d / pinchDist);
      pinchDist = d;
    }
  });
  function endTouch(e) {
    if (e.pointerType !== 'touch') return;
    activeTouches.delete(e.pointerId);
    if (activeTouches.size < 2) pinchDist = null;
  }
  canvas.addEventListener('pointerup', endTouch);
  canvas.addEventListener('pointercancel', endTouch);

  // ---------- toolbar / UI wiring ----------

  function setTool(id) {
    rb.state.tool = id;
    armedFrom = null;
    if (id) selectedId = null;
    document.querySelectorAll('.tool').forEach((b) => b.classList.toggle('is-on', b.dataset.tool === id));
    arena.classList.remove('tool-track', 'tool-station', 'tool-train', 'tool-remove');
    if (id) arena.classList.add(`tool-${id}`);
  }
  document.querySelectorAll('.tool').forEach((btn) => {
    btn.addEventListener('click', () => setTool(rb.state.tool === btn.dataset.tool ? null : btn.dataset.tool));
  });

  const modalOpen = () => ['#pausemenu', '#results', '#help'].some((sel) => !$(sel).hidden);

  function setSpeedUI(idx) {
    document.querySelectorAll('#speed-seg button').forEach((b) => b.classList.toggle('is-on', Number(b.dataset.speed) === idx));
  }
  function setSpeed(idx) {
    if (!rb.state || rb.state.gameOver || modalOpen()) return;
    if (idx > 0) rb.state.lastSpeed = idx;
    rb.state.speedIdx = idx;
    setSpeedUI(idx);
  }
  function togglePause() { setSpeed(rb.state.speedIdx ? 0 : (rb.state.lastSpeed || 1)); }
  document.querySelectorAll('#speed-seg button').forEach((btn) => {
    btn.addEventListener('click', () => setSpeed(Number(btn.dataset.speed)));
  });

  document.querySelectorAll('#mode-seg button').forEach((btn) => {
    btn.addEventListener('click', () => {
      // Only a genuine mode CHANGE throws the run away — re-clicking the mode
      // you're already in used to silently restart you.
      if (btn.dataset.mode === rb.state.mode) return;
      document.querySelectorAll('#mode-seg button').forEach((b) => b.classList.toggle('is-on', b === btn));
      newGame(btn.dataset.mode, takeSeed());
      setSpeedUI(rb.state.speedIdx);
      $('#results').hidden = true;
    });
  });

  $('#btn-fit').onclick = () => { camera.manual = false; };
  $('#btn-help').onclick = () => { $('#help').hidden = false; };
  $('#btn-help-close').onclick = () => { $('#help').hidden = true; };
  $('#btn-sound').onclick = (e) => {
    const on = audio.toggle();
    e.currentTarget.setAttribute('aria-pressed', String(on));
    persistSettings();
  };
  $('#btn-sound').setAttribute('aria-pressed', String(audio.on));
  $('#btn-again').onclick = () => {
    $('#results').hidden = true;
    newGame(rb.state.mode, takeSeed());
    setSpeedUI(rb.state.speedIdx);
  };

  // ---------- menu (pause + restart) ----------

  function openMenu() {
    if (!rb.state || rb.state.gameOver || modalOpen()) return;
    if (rb.state.speedIdx) rb.state.lastSpeed = rb.state.speedIdx;
    rb.state.speedIdx = 0;
    setSpeedUI(0);
    $('#pause-main').hidden = false;
    $('#pause-confirm').hidden = true;
    $('#pausemenu').hidden = false;
  }
  function closeMenu() {
    $('#pausemenu').hidden = true;
    setSpeed(rb.state.lastSpeed || 1);
  }
  $('#btn-menu').onclick = openMenu;
  $('#btn-resume').onclick = closeMenu;
  $('#btn-restart').onclick = () => { $('#pause-main').hidden = true; $('#pause-confirm').hidden = false; };
  $('#btn-restart-cancel').onclick = () => { $('#pause-confirm').hidden = true; $('#pause-main').hidden = false; };
  $('#btn-restart-confirm').onclick = () => {
    $('#pausemenu').hidden = true;
    newGame(rb.state.mode, takeSeed());
    setSpeedUI(rb.state.speedIdx);
  };

  window.addEventListener('keydown', (e) => {
    if (!rb.state) return;
    if (e.key === 'Escape') {
      if (!$('#pausemenu').hidden) closeMenu();
      else if (!$('#help').hidden) $('#help').hidden = true;
      else if (rb.draft) cancelDraft();
      else if (armedFrom !== null) armedFrom = null;
      else if (selectedId !== null) selectedId = null;
      else openMenu();
      return;
    }
    if (modalOpen()) return;
    if (e.code === 'Space') { e.preventDefault(); togglePause(); }
    else if (e.key === '1' || e.key === '2' || e.key === '3') setSpeed(Number(e.key));
    else if (e.key === 't' || e.key === 'T') setTool(rb.state.tool === 'track' ? null : 'track');
    else if (e.key === 's' || e.key === 'S') setTool(rb.state.tool === 'station' ? null : 'station');
    else if (e.key === 'r' || e.key === 'R') setTool(rb.state.tool === 'train' ? null : 'train');
    else if (e.key === 'x' || e.key === 'X') setTool(rb.state.tool === 'remove' ? null : 'remove');
  });

  window.addEventListener('resize', fitCanvas);
  document.addEventListener('visibilitychange', () => { if (document.hidden) persistRun(); });

  // ---------- boot ----------

  // A #seed= in the address is a town somebody shared. With no run going it is the run; a run
  // already going on a different mat carries on, and the shared town waits for the next restart.
  let pendingSeed = readSeed();
  function takeSeed() { const s = pendingSeed; pendingSeed = null; return s; }
  const resumed = loadRun();
  if (resumed && resumed.state && resumed.state.inv) {
    resumeGame(resumed);
    if (pendingSeed != null && rb.state.seed === pendingSeed) pendingSeed = null;
    if (pendingSeed != null) toast('That link is somebody else’s town. Restart to play it; your own run carries on until you do.');
    else if (rb.state.seed != null) writeSeed(rb.state.seed);
  } else newGame(save.mode || 'survival', takeSeed());

  document.querySelectorAll('#mode-seg button').forEach((b) => b.classList.toggle('is-on', b.dataset.mode === rb.state.mode));
  setSpeedUI(rb.state.speedIdx);

  fitCanvas();
  camera.scale = minScale();
  clampCamera();
  loadTextures();

  let last = performance.now();
  let autosaveAcc = 0;
  function frame(ts) {
    const dt = clamp((ts - last) / 1000, 0, 0.05);
    last = ts;
    tick(dt);
    updateCamera(dt);
    draw();
    updateBubbles();
    updateHUD();
    autosaveAcc += dt;
    if (autosaveAcc > 5) { autosaveAcc = 0; persistRun(); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- debug handle ----------

  expose('routeBuilder', {
    get state() { return rb.state; },
    get stations() { return stations; },
    get lines() { return lines; },
    get trains() { return trains; },
    get routing() { return rb.routing; },
    get camera() { return camera; },
    // Runs the world forward n steps regardless of the speed buttons.
    tick(n = 1, dt = 1 / 20) { for (let i = 0; i < n && !rb.state.gameOver; i++) step(dt); },
    spawnStation(type) { return spawnStation(type); },
    spawnPeg(stationId, type) {
      const s = stationById(stationId);
      const t = type || pick(availableTypes().filter((x) => x !== s.type));
      s.pegs.push({ id: rb.state.nextPegId++, type: t, since: rb.state.totalTime });
      return t;
    },
    layLine(stationIds, loop) {
      const line = { id: rb.state.nextLineId++, stationIds: stationIds.slice(), loop: !!loop, pieces: 0 };
      lines.push(line);
      rebuildRouting();
      return line;
    },
    addTrain(lineId, carriages, near) { return newTrain(lineById(lineId), carriages || 1, near); },
    addHouse(x, y) { addHouse({ x, y }, null); },
    growHouse,
    housesNear: (x, y) => housesNear({ x, y }),
    neighbourhoodService,
    walkersFor: (id) => walkersFor(stationById(id)).length,
    stationHouses: (id) => stationHouses(stationById(id)),
    stationRange: (id) => stationRange(stationById(id)),
    trainPieces(id) { const t = trains.find((x) => x.id === id); return t && t.trail ? trainPieces(t, trainBody(t)) : null; },
    pressureDay: () => pressureDay(),
    setSpeed,
    setTool,
    newGame,
    rebuildRouting,
    worldToScreen,
    minScale,
    // Below: the same functions a real drag/click drives, exposed directly so
    // tests can exercise the real toy-box/routing logic without simulating
    // DOM pointer events (which would fight the real listeners' pointer capture).
    buildDraft(stationIds) {
      if (stationIds.length < 2) return;
      beginDraft(stationIds[0]);
      for (let i = 1; i < stationIds.length; i++) tryAppendDraft(stationIds[i]);
      commitDraft();
    },
    placeStation(x, y) { return placeStation({ x, y }); },
    select(id) { selectStation(id); },
    pointsAgainst() { return [...pointsAgainst()]; },
    get selected() { return selectedId; },
    upgradeStation(id) { const s = stationById(id); return s ? upgradeStation(s) : false; },
    placeTrain(lineId) { const l = lineById(lineId); if (l) placeTrain(l); },
    addCarriage(trainId) { const t = trains.find((x) => x.id === trainId); if (t) addCarriage(t); },
    removeLine(lineId) { const l = lineById(lineId); if (l) removeLine(l); },
    removeTrain(trainId) { const t = trains.find((x) => x.id === trainId); if (t) removeTrain(t); },
    removeStation(id) { const s = stationById(id); if (s) removeStation(s); },
  });
