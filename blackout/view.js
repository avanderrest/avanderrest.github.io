/* Blackout: the screen. The compound drawn on an isometric canvas (floors, walls cut away
   towards the camera, the light maps and the fog), the people, previews and tracers, the
   HUD, the title and end cards, the terminal's bar, keys and pointer, the sound, and the
   saved bests. See sim.js for the rules. */
import { createBlackout, freshRecords, fromV3 } from './sim.js';
import { expose } from '../lib/debug.js';

  const SAVE_KEY = 'blackout-save-v4';
  const OLD_SAVE_KEY = 'blackout-save-v3';
  const SOUND_KEY = 'blackout-sound';
  const DIFF_KEY = 'blackout-difficulty';
  ['blackout-save-v2', 'blackout-scale'].forEach((k) => { try { localStorage.removeItem(k); } catch (e) { /* storage blocked */ } });

  const bo = createBlackout({ records: { load: () => loadSave(), write: (r) => writeSave(r) }, on: onEvent,
    anchor: (t) => targetAnchor(t) });
  const {
    begin, use, loadMission, mkGuard, newGame, opaque, losF, lampPoint, computeLight, coneRangeOf, conePlane, inCone, seesTile, camPoint, camSees, watchedAt, computeTorch, hintCard, computeVision, seeFrom, passable, neighbours, stairOther, bfs, nextStep, computeReach, computeDanger, pathTo, resolveTarget, dropMoves, cancelMoves, moveTo, stepTarget, stepDir, stopWalk, stay, wait, spend, walkStep, playerStep, afterAction, act, pickUp, advance, checkWin, adjacent, canTakedown, contextAction, doAction, doActionNow, targetPos, fireCheck, targets, fire, fireNow, toggleRun, toggleNV, makeNoise, detect, foundBody, spottedBy, raiseAlarm, tickBegin, worldTick, guardStep, guardBlockedOnly, walkToward, nearestWaypoint, wanderTarget, guardShoots, die, win, takeCheckpoint, restoreCheckpoint, startHack, stepHack, hackPress, finishHack, leaveHack, enqueue, pump, flush, snapAll, fxText, HW, HH, STOREY, WALL_H, WALL_CUT, SLAB, FENCE_H, RAIL_H, CRATE_H, POST_H, WT, GUARD_EVERY, GUARD_EVERY_ALARM, MOVE_RUN, MOVE_DRAG, STEP_T, RUN_T, CAM_EVERY, LOOK_EVERY, CORNER_WAIT, RING, START_HP, ROUNDS, NV_DRAIN, NV_CHARGE, SIGHT_DARK, SIGHT_NV, SIGHT_MAX, SHOT_RANGE, LAMP_R, LIT, SEE_LIGHT, AMBIENT_OUT, AMBIENT_IN, CONE_HALF, CONE_RANGE, TORCH_REACH, HUNT_REACH, FLOOD_RANGE, CAM_RANGE, CAM_HALF, SEEN_GAIN, SEEN_CAM, SEEN_DECAY, REINFORCE, REINFORCE_DELAY, NOISE_RUN, NOISE_GLASS, NOISE_HACK, HACK, DIRS, DIR_A, PHASES_BASE, MISSIONS, W, H, LV, N, TILE, key, kx, ky, kl, inb, ch, tile, inRegion, regionOf, angDiff, dirIndex, clamp, doorOpen, los, lampTile, flood, guardAt, bodyAt, pkey, canAct, idle, ringSize, ARROW_DIR, arrowTarget, SNAP_KEYS, hackStatus, bestOf,
  } = bo;
  try { if (localStorage.getItem(DIFF_KEY) === 'hard') bo.difficulty = 'hard'; } catch (e) { /* storage blocked */ }

  function onEvent(ev, d) {
    switch (ev) {
      case 'say': say(...d); break;
      case 'sfx': SOUNDS[d[0]](...d.slice(1)); break;
      case 'light': paintLightmaps(); break;
      case 'fog': paintFog(); break;
      case 'end': if (d === null) hideEnd(); else showEnd(d); break;
      case 'hack': el.hack.hidden = !d; break;
      case 'hack-status': el.hackStatus.textContent = d[0]; el.hackStatus.className = 'termline' + (d[1] ? ' ' + d[1] : ''); break;
    }
  }

  // the sounds the rules ask for, by name
  const SOUNDS = {
    tone: (...a) => sfx(...a), step: (...a) => sfxStep(...a), thud: (...a) => sfxThud(...a),
    shot: (...a) => sfxShot(...a), glass: (...a) => sfxGlass(...a), alarm: (...a) => sfxAlarm(...a),
  };

  const LM_RES = 4;   // light-map cells per tile, so pools are round and walls cast shadows
  const lmCanvas = [], fogCanvas = [];
  for (let lv = 0; lv < LV; lv++) {
    const a = document.createElement('canvas'); a.width = W * LM_RES; a.height = H * LM_RES; lmCanvas.push(a);
    const b = document.createElement('canvas'); b.width = W; b.height = H; fogCanvas.push(b);
  }

  function paintLightmaps() {
    for (let lv = 0; lv < LV; lv++) {
      const c = lmCanvas[lv], g = c.getContext('2d');
      const img = g.createImageData(c.width, c.height), d = img.data;
      const lamps = bo.state.lamps.filter((l) => l.alive && l.lv === lv).map((l) => {
        const [px, py] = lampPoint(l);
        return { px, py, col: l.kind === 'ceil' ? [196, 232, 226] : [255, 212, 138] };
      });
      for (let j = 0; j < c.height; j++) {
        for (let i = 0; i < c.width; i++) {
          const tx = Math.floor(i / LM_RES), ty = Math.floor(j / LM_RES);
          const t = tile(tx, ty, lv);
          if (!t || t.wall) continue;
          const u = (i + 0.5) / LM_RES, v = (j + 0.5) / LM_RES;
          let best = 0, col = null;
          for (const l of lamps) {
            const dd = Math.hypot(u - l.px, v - l.py);
            if (dd >= LAMP_R) continue;
            let a = 1 - dd / LAMP_R;
            a = a * a * (1.6 - 0.6 * a);
            if (a <= best) continue;
            if (dd > 0.4 && !losF(l.px, l.py, u, v, lv)) continue;
            best = a; col = l.col;
          }
          if (!col) continue;
          const o = (j * c.width + i) * 4;
          d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = Math.min(255, best * 235);
        }
      }
      g.putImageData(img, 0, 0);
    }
  }

  const FOG = [22, 29, 31];
  function paintFog() {
    for (let lv = 0; lv < LV; lv++) {
      const c = fogCanvas[lv], g = c.getContext('2d');
      const img = g.createImageData(W, H), d = img.data;
      const A = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const k = key(x, y, lv);
          if (!tile(x, y, lv)) { A[y * W + x] = 255; continue; }   // decided below
          const v = bo.state.vis[k];
          A[y * W + x] = v === 2 ? 0 : v === 1 ? 128 : 218;
        }
      }
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          let a = A[y * W + x];
          if (!tile(x, y, lv)) {
            // off the map: take the fog of the nearest floor, so its edge does not fade out
            a = 0;
            for (const [dx, dy] of DIRS) {
              const xx = x + dx, yy = y + dy;
              if (xx < 0 || yy < 0 || xx >= W || yy >= H || !tile(xx, yy, lv)) continue;
              a = Math.max(a, A[yy * W + xx]);
            }
          }
          const o = (y * W + x) * 4;
          d[o] = FOG[0]; d[o + 1] = FOG[1]; d[o + 2] = FOG[2]; d[o + 3] = a;
        }
      }
      g.putImageData(img, 0, 0);
    }
  }

  // ---------- messages ----------
  let msgTimer = 0;
  function say(text, kind) {
    el.msg.textContent = text;
    el.msg.className = 'msg on' + (kind ? ' ' + kind : '');
    msgTimer = 2.8;
  }

  // the terminal's bar, drawn each frame while the hack is up
  function paintHack(dt) {
    const h = bo.state.hack;
    stepHack(dt);
    el.hackMark.style.left = (h.pos * 100) + '%';
    el.hackZone.style.left = (h.zoneAt * 100) + '%';
    el.hackZone.style.width = (h.zone * 100) + '%';
  }

  // ---------- rendering ----------
  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d');
  const cam = { x: 0, y: 0, zoom: 1, free: false, set: false };
  let dpr = 1, CW = 0, CH = 0, time = 0;

  const PX = (x, y) => (x - y) * HW;
  const PY = (x, y, z) => (x + y) * HH - z;

  function fitCanvas() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    CW = Math.max(1, Math.round(r.width * dpr));
    CH = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== CW || canvas.height !== CH) { canvas.width = CW; canvas.height = CH; }
    if (!cam.set) { cam.zoom = clamp(r.width / 1250, 0.6, 1.25); cam.set = true; }
  }

  const viewScale = () => cam.zoom * dpr;
  function worldToScreen(wx, wy) {
    const z = viewScale();
    return [(wx - cam.x) * z + CW / 2, (wy - cam.y) * z + CH / 2];
  }
  function screenToWorld(sx, sy) {
    const z = viewScale();
    return [(sx - CW / 2) / z + cam.x, (sy - CH / 2) / z + cam.y];
  }

  // colour helpers: a base colour warmed by lamplight and sunk into fog when out of sight
  function shade(c, k, mul) {
    const L = Math.min(1, bo.state.light[k] || 0);
    const m = (mul || 1) * (0.82 + 0.3 * L);
    let r = c[0] * m, g = c[1] * m, b = c[2] * m;
    r += (255 - r) * L * 0.2; g += (226 - g) * L * 0.16; b += (170 - b) * L * 0.06;
    if (bo.state.vis[k] !== 2) { r += (FOG[0] - r) * 0.6; g += (FOG[1] - g) * 0.6; b += (FOG[2] - b) * 0.6; }
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }
  const rgba = (c, a) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';

  function poly(pts, fill, stroke, lw) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
  }
  const P3 = (x, y, z) => [PX(x, y), PY(x, y, z)];

  // An axis-aligned box in tile units, z in pixels. Only the three faces the
  // camera sees: the top, the one facing +y (lower left) and the one facing +x.
  function box(x0, y0, x1, y1, z0, z1, top, left, right) {
    if (left) poly([P3(x0, y1, z0), P3(x1, y1, z0), P3(x1, y1, z1), P3(x0, y1, z1)], left);
    if (right) poly([P3(x1, y0, z0), P3(x1, y1, z0), P3(x1, y1, z1), P3(x1, y0, z1)], right);
    if (top) poly([P3(x0, y0, z1), P3(x1, y0, z1), P3(x1, y1, z1), P3(x0, y1, z1)], top);
  }
  const diamond = (x, y, z, inset) => {
    const i = inset || 0;
    return [P3(x + i, y + i, z), P3(x + 1 - i, y + i, z), P3(x + 1 - i, y + 1 - i, z), P3(x + i, y + 1 - i, z)];
  };

  // the chain-link mesh
  const meshPattern = (() => {
    const c = document.createElement('canvas'); c.width = 6; c.height = 6;
    const g = c.getContext('2d');
    g.strokeStyle = 'rgba(190,204,202,0.7)'; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(6, 6); g.moveTo(6, 0); g.lineTo(0, 6); g.stroke();
    return ctx.createPattern(c, 'repeat');
  })();

  // a soft cloud, drawn once and scattered about for the fog the compound floats in
  const cloud = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    let s = 7;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 26; i++) {
      const x = 60 + rnd() * 136, y = 70 + rnd() * 116, r = 30 + rnd() * 60;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(118,134,136,0.2)');
      gr.addColorStop(1, 'rgba(118,134,136,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 256, 256);
    }
    return c;
  })();
  const CLOUDS = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    return { x: 15 + Math.cos(a) * 25 + ((i * 37) % 7) - 3, y: 12 + Math.sin(a) * 22 + ((i * 53) % 5) - 2, s: 3.2 + (i % 4) * 0.9, v: 0.05 + (i % 3) * 0.03 };
  });

  const FLOORS = {
    yard: { fill: '#303c3c', line: '#3a4747' },
    tile: { fill: '#36413f', line: '#44504e' },
    dirt: { fill: '#262d2b', line: null },
    grate: { fill: '#3a4245', line: '#4b5458' },
  };

  // a ground tile under an upper floor that is being drawn, which hides what is beneath it
  const roofedOver = (x, y) => bo.UPPER.some((r) => !r.open && regionShown(r) && inRegion(r, x, y));

  function regionShown(r) {
    if (r.open) return true;
    const p = bo.state.player;
    return p.lv >= r.lv && inRegion(r, p.x, p.y);
  }

  function render(dt) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const bg = ctx.createRadialGradient(CW / 2, CH / 2, 0, CW / 2, CH / 2, Math.max(CW, CH) * 0.75);
    bg.addColorStop(0, '#263032');
    bg.addColorStop(1, '#111618');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CW, CH);
    if (!bo.state) return;

    const z = viewScale();
    ctx.setTransform(z, 0, 0, z, CW / 2 - cam.x * z, CH / 2 - cam.y * z);
    drawClouds(0.7, false);

    // the ground floor
    drawFloors(0, null);
    drawOverlay(0, null);
    drawReach(0, null);
    drawCones(0, null);
    drawRings(0);
    const ground = gatherObjects(0, null);
    ground.forEach((it) => it.fn());

    // the floors above, each redrawing anything on the ground that stands in front of it
    for (const r of bo.UPPER) {
      if (!regionShown(r)) continue;
      drawFloors(r.lv, r);
      drawOverlay(r.lv, r);
      drawReach(r.lv, r);
      drawCones(r.lv, r);
      drawRings(r.lv);
      gatherObjects(r.lv, r).forEach((it) => it.fn());
      const bb = regionBox(r);
      ground.forEach((it) => {
        if (!it.front || !(it.x > r.x1 || it.y > r.y1)) return;
        const sx = PX(it.x + 0.5, it.y + 0.5), sy = PY(it.x + 0.5, it.y + 0.5, 0);
        if (sx + 34 < bb[0] || sx - 34 > bb[2] || sy + 10 < bb[1] || sy - 80 > bb[3]) return;
        it.fn();
      });
    }

    drawGlows();
    drawPathPreview();
    drawInvestigations();
    drawCardGhost();
    drawTracers();
    drawClouds(0.1, true);

    // the screen: goggles, a hit, the alarm
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (bo.state.nv) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = '#86ffae';
      ctx.fillRect(0, 0, CW, CH);
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = 'rgba(24,92,48,0.55)';
      ctx.fillRect(0, 0, CW, CH);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      for (let y = 0; y < CH; y += 4 * dpr) ctx.fillRect(0, y, CW, dpr);
    }
    const vg = ctx.createRadialGradient(CW / 2, CH / 2, Math.min(CW, CH) * 0.35, CW / 2, CH / 2, Math.max(CW, CH) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, bo.state.alarm ? 'rgba(120,10,14,' + (0.35 + 0.15 * Math.sin(time * 5)) + ')' : 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, CW, CH);
    for (const f of bo.state.fx) {
      if (f.kind !== 'flash') continue;
      ctx.fillStyle = 'rgba(255,40,40,' + (0.35 * (1 - f.t / f.life)) + ')';
      ctx.fillRect(0, 0, CW, CH);
    }
    drawScreenUI();
  }

  // an upper floor's outline on screen, walls and all
  function regionBox(r) {
    const zb = r.lv * STOREY;
    return [PX(r.x0, r.y1 + 1), PY(r.x0, r.y0, zb + WALL_H + 10), PX(r.x1 + 1, r.y0), PY(r.x1 + 1, r.y1 + 1, zb)];
  }

  function drawClouds(alpha, over) {
    const tt = time;
    for (const c of CLOUDS) {
      const cx = c.x + Math.sin(tt * c.v + c.s) * 1.5, cy = c.y + Math.cos(tt * c.v * 0.8 + c.s) * 1.2;
      const sx = PX(cx, cy), sy = PY(cx, cy, 0);
      const s = c.s * 110;
      ctx.globalAlpha = over ? alpha : alpha;
      ctx.drawImage(cloud, sx - s / 2, sy - s / 2, s, s * 0.7);
    }
    ctx.globalAlpha = 1;
  }

  function drawFloors(lv, r) {
    const zb = lv * STOREY;
    const groups = {};
    const sides = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = tile(x, y, lv);
        if (!t) continue;
        if (r && !inRegion(r, x, y)) continue;
        if (lv > 0 && t.top) continue;               // the stairwell: look down the stairs
        const k = key(x, y, lv);
        if (bo.state.vis[k] === 0 && lv > 0) { /* still drawn; the fog covers it */ }
        (groups[t.floor] = groups[t.floor] || []).push([x, y]);
        if (lv === 0) {
          if (!tile(x + 1, y, 0)) sides.push([x, y, 'x', SLAB]);
          if (!tile(x, y + 1, 0)) sides.push([x, y, 'y', SLAB]);
        } else {
          if (x === r.x1) sides.push([x, y, 'x', STOREY - WALL_H]);
          if (y === r.y1) sides.push([x, y, 'y', STOREY - WALL_H]);
        }
      }
    }
    for (const f in groups) {
      const st = FLOORS[f];
      ctx.beginPath();
      for (const [x, y] of groups[f]) {
        const d = diamond(x, y, zb);
        ctx.moveTo(d[0][0], d[0][1]); ctx.lineTo(d[1][0], d[1][1]); ctx.lineTo(d[2][0], d[2][1]); ctx.lineTo(d[3][0], d[3][1]); ctx.closePath();
      }
      ctx.fillStyle = st.fill;
      ctx.fill();
      if (st.line) { ctx.strokeStyle = st.line; ctx.lineWidth = 1; ctx.stroke(); }
    }
    for (const [x, y, ax, depth] of sides) {
      const k = key(x, y, lv);
      if (ax === 'x') poly([P3(x + 1, y, zb), P3(x + 1, y + 1, zb), P3(x + 1, y + 1, zb - depth), P3(x + 1, y, zb - depth)], shade([30, 38, 40], k, 0.9));
      else poly([P3(x, y + 1, zb), P3(x + 1, y + 1, zb), P3(x + 1, y + 1, zb - depth), P3(x, y + 1, zb - depth)], shade([38, 47, 49], k, 0.9));
    }
  }

  // fog of war and lamplight, each a tile-sized image stretched over the floor
  function drawOverlay(lv, r) {
    ctx.save();
    const zb = lv * STOREY;
    if (r) {
      poly([P3(r.x0, r.y0, zb), P3(r.x1 + 1, r.y0, zb), P3(r.x1 + 1, r.y1 + 1, zb), P3(r.x0, r.y1 + 1, zb)], null);
      ctx.clip();
    }
    ctx.imageSmoothingEnabled = true;
    ctx.save();
    ctx.transform(HW, HH, -HW, HH, 0, -zb);
    ctx.drawImage(fogCanvas[lv], 0, 0);
    ctx.restore();
    ctx.save();
    ctx.transform(HW / LM_RES, HH / LM_RES, -HW / LM_RES, HH / LM_RES, 0, -zb);
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.72;
    ctx.drawImage(lmCanvas[lv], 0, 0);
    ctx.restore();
    ctx.restore();
  }

  function planeOK(lv, r, x, y) {
    if (lv === 0) return !r;
    return r && inRegion(r, x, y);
  }

  let hover = { obj: null, tile: -1 };

  function drawReach(lv, r) {
    if (!canAct() || !bo.state.reach) return;
    const D = bo.state.reach.dist, zb = lv * STOREY, R = ringSize();
    const blue = bo.state.run ? [214, 170, 96] : [110, 162, 214];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!planeOK(lv, r, x, y) || !idle()) continue;
        const k = key(x, y, lv);
        if (D[k] <= 0 || D[k] > R) continue;
        if (lv > 0 && ch(x, y, lv) === 's') continue;
        const c = bo.state.danger[k] ? [214, 86, 80] : blue;
        poly(diamond(x, y, zb, 0.04), rgba(c, 0.26), rgba(c, 0.42), 1);
      }
    }
    // your own tile: white brackets at its corners, as the mockup marks a unit
    const p = bo.state.player;
    if (p.lv === lv && planeOK(lv, r, p.x, p.y)) brackets(p.x, p.y, zb, 'rgba(240,244,244,0.9)');
  }

  function brackets(x, y, zb, col) {
    const d = diamond(x, y, zb, 0.06);
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = d[i], b = d[(i + 1) % 4], c = d[(i + 3) % 4];
      ctx.moveTo(a[0] + (b[0] - a[0]) * 0.28, a[1] + (b[1] - a[1]) * 0.28);
      ctx.lineTo(a[0], a[1]);
      ctx.lineTo(a[0] + (c[0] - a[0]) * 0.28, a[1] + (c[1] - a[1]) * 0.28);
    }
    ctx.stroke();
  }

  // rays marched out from a point until they meet something that stops sight
  function coneShape(ox, oy, a, half, range, lv, high, inner) {
    const outer = [], near = [];
    const n = 24;
    for (let i = 0; i <= n; i++) {
      const ang = a - half + (2 * half * i) / n;
      const cx = Math.cos(ang), cy = Math.sin(ang);
      let t = 0.35;
      for (; t < range; t += 0.1) {
        const px = ox + cx * t, py = oy + cy * t;
        const tx = Math.floor(px), ty = Math.floor(py);
        if (!tile(tx, ty, lv)) break;
        if (high && Math.hypot(tx + 0.5 - ox, ty + 0.5 - oy) < 2.2) continue;
        if (tx === Math.floor(ox) && ty === Math.floor(oy)) continue;
        if (opaque(tx, ty, lv, high)) break;
      }
      outer.push([ox + cx * t, oy + cy * t]);
      const ti = Math.min(t, inner);
      near.push([ox + cx * ti, oy + cy * ti]);
    }
    return { outer, near };
  }

  function drawCone(ox, oy, zb, shape, col, aOuter, aInner) {
    const o = P3(ox, oy, zb);
    const outer = [o].concat(shape.outer.map(([x, y]) => P3(x, y, zb)));
    const grad = ctx.createRadialGradient(o[0], o[1], 4, o[0], o[1], 260);
    grad.addColorStop(0, rgba(col, aOuter * 1.4));
    grad.addColorStop(1, rgba(col, aOuter * 0.6));
    poly(outer, grad);
    if (aInner) poly([o].concat(shape.near.map(([x, y]) => P3(x, y, zb))), rgba(col, aInner));
    ctx.strokeStyle = rgba(col, aOuter * 1.8);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(o[0], o[1]); ctx.lineTo(outer[1][0], outer[1][1]);
    ctx.moveTo(o[0], o[1]); ctx.lineTo(outer[outer.length - 1][0], outer[outer.length - 1][1]);
    ctx.stroke();
  }

  function drawCones(lv, r) {
    const zb = lv * STOREY;
    for (const g of bo.state.guards) {
      if (g.down || g.carried || conePlane(g) !== lv) continue;
      if (!planeOK(lv, r, g.x, g.y) && !(flood(g) && !r)) continue;
      const seen = bo.state.vis[key(g.x, g.y, g.lv)] === 2;
      const hunting = g.mode === 'hunt';
      const col = hunting ? [236, 96, 84] : flood(g) ? [240, 226, 170] : [236, 200, 116];
      const ox = g.rx + 0.5, oy = g.ry + 0.5;
      const shape = coneShape(ox, oy, g.ra, CONE_HALF, coneRangeOf(g), lv, flood(g), flood(g) ? 99 : hunting ? HUNT_REACH : TORCH_REACH);
      const k = seen ? 1 : 0.55;
      drawCone(ox, oy, zb, shape, col, (flood(g) ? 0.2 : 0.13) * k, flood(g) ? 0 : 0.2 * k);
    }
    for (const c of bo.state.cams) {
      if (!c.alive || c.lv !== lv || !planeOK(lv, r, c.x, c.y)) continue;
      const shape = coneShape(c.x + 0.5, c.y + 0.5, c.ra, c.half || CAM_HALF, CAM_RANGE, lv, false, 1.5);
      drawCone(c.x + 0.5, c.y + 0.5, zb, shape, [150, 214, 240], 0.1, 0.1);
    }
  }

  function drawRings(lv) {
    for (const f of bo.state.fx) {
      if (f.kind !== 'ring' || f.lv !== lv) continue;
      const k = f.t / f.life;
      const c = P3(f.x + 0.5, f.y + 0.5, lv * STOREY);
      ctx.strokeStyle = 'rgba(236,210,150,' + (0.6 * (1 - k)) + ')';
      ctx.lineWidth = 2;
      for (let i = 0; i < 2; i++) {
        const rr = f.r * (k * 0.9 + i * 0.12) * HW * 1.414;
        if (rr <= 0) continue;
        ctx.beginPath();
        ctx.ellipse(c[0], c[1], rr, rr / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  /* The things standing on a floor, sorted back to front. Each item carries its
     tile so the pass over an upper floor can redraw what stands in front of it. */
  function gatherObjects(lv, r) {
    const items = [];
    const push = (x, y, d, fn, front) => items.push({ x, y, d, fn, front });
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (r && !inRegion(r, x, y)) continue;
        if (lv > 0 && !r) continue;
        const t = tile(x, y, lv);
        if (!t) continue;
        const k = key(x, y, lv);
        if (bo.state.vis[k] === 0) continue;
        if (t.wall || t.fence || t.rail || t.crate || t.terminal || (t.stairs && !t.top)) {
          push(x, y, x + y + 0.5, () => drawTileObject(x, y, lv, t, k), !!(t.fence || t.crate));
        }
      }
    }
    for (const l of bo.state.lamps) {
      if (l.lv !== lv) continue;
      const mx = l.kind === 'wall' ? l.mx : l.x, my = l.kind === 'wall' ? l.my : l.y;
      if (r ? !inRegion(r, mx, my) : lv > 0) continue;
      if (bo.state.vis[key(l.x, l.y, lv)] === 0 && bo.state.vis[key(mx, my, lv)] === 0) continue;
      const d = l.kind === 'wall' ? mx + my + 0.62 : l.kind === 'ceil' ? l.x + l.y + 1.2 : l.x + l.y + 0.5;
      push(mx, my, d, () => drawLamp(l), l.kind === 'post');
    }
    if (lv === 0 && !r) {
      for (const l of bo.LADDERS) {
        const [fx, fy] = l.foot;
        if (bo.state.vis[key(fx, fy, 0)] === 0 && bo.state.vis[key(l.top[0], l.top[1], l.top[2])] === 0) continue;
        push(fx, fy, l.top[0] + l.top[1] + 0.9, () => drawLadder(l), true);
      }
    }
    for (const c of bo.state.cams) {
      if (c.lv !== lv || (r ? !inRegion(r, c.mx, c.my) : lv > 0)) continue;
      if (bo.state.vis[key(c.x, c.y, lv)] === 0) continue;
      push(c.mx, c.my, c.mx + c.my + 0.65, () => drawCamera(c), false);
    }
    for (const g of bo.state.guards) {
      if (g.lv !== lv || g.carried) continue;
      if (r ? !inRegion(r, g.x, g.y) : lv > 0) continue;
      const v = bo.state.vis[key(g.x, g.y, lv)];
      if (g.down) { if (v >= 1) push(g.x, g.y, g.rx + g.ry + 0.3, () => drawBody(g), true); continue; }
      if (v !== 2) continue;
      push(g.x, g.y, g.rx + g.ry + 0.51, () => drawGuard(g), true);
    }
    const p = bo.state.player;
    if (p.lv === lv && (r ? inRegion(r, p.x, p.y) : lv === 0 || !regionOf(p.x, p.y, lv))) {
      push(p.x, p.y, p.rx + p.ry + 0.52, drawPlayer, true);
    }
    items.sort((a, b) => a.d - b.d);
    return items;
  }

  function drawTileObject(x, y, lv, t, k) {
    if (t.wall) drawWall(x, y, lv, t, k);
    else if (t.fence) drawFence(x, y, lv, t, k);
    else if (t.rail) drawRail(x, y, lv, k);
    else if (t.crate) drawCrate(x, y, lv, k);
    else if (t.terminal) drawTerminal(x, y, lv, k);
    else if (t.stairs) drawStairs(x, y, lv, k);
  }

  const WALL_TOP = [128, 142, 138], WALL_L = [80, 93, 91], WALL_R = [62, 73, 72];

  function wallHeight(x, y, lv) {
    const p = bo.state.player;
    if (lv !== p.lv) return WALL_H;
    const dd = (x + y) - (p.rx + p.ry), lat = Math.abs((x - y) - (p.rx - p.ry));
    return dd > 0.2 && dd < 6.5 && lat < 4.5 ? WALL_CUT : WALL_H;
  }

  function drawWall(x, y, lv, t, k) {
    const zb = lv * STOREY;
    const isWall = (xx, yy) => { const tt = tile(xx, yy, lv); return !!(tt && tt.wall); };
    const n = isWall(x, y - 1), s = isWall(x, y + 1), w = isWall(x - 1, y), e = isWall(x + 1, y);
    const h = wallHeight(x, y, lv);
    const top = shade(WALL_TOP, k), left = shade(WALL_L, k), right = shade(WALL_R, k);
    const c0 = 0.5 - WT, c1 = 0.5 + WT;

    if (t.door) {
      const open = doorOpen(x, y, lv) || guardAt(x, y, lv) || (bo.state.player.x === x && bo.state.player.y === y && bo.state.player.lv === lv);
      const ns = n || s;
      const bx0 = ns ? x + c0 : x, by0 = ns ? y : y + c0, bx1 = ns ? x + c1 : x + 1, by1 = ns ? y + 1 : y + c1;
      if (open) {
        const ht = Math.min(h, WALL_H);
        if (ht >= WALL_H) box(bx0, by0, bx1, by1, zb + 34, zb + ht, top, left, right);
        const col = shade([70, 80, 84], k);
        if (ns) { box(x + c0, y, x + c1, y + 0.08, zb, zb + Math.min(34, ht), top, col, col); box(x + c0, y + 0.92, x + c1, y + 1, zb, zb + Math.min(34, ht), top, col, col); }
        else { box(x, y + c0, x + 0.08, y + c1, zb, zb + Math.min(34, ht), top, col, col); box(x + 0.92, y + c0, x + 1, y + c1, zb, zb + Math.min(34, ht), top, col, col); }
      } else {
        box(bx0, by0, bx1, by1, zb, zb + h, top, shade([70, 76, 82], k), shade([56, 62, 68], k));
        // the card reader: red until the card opens it
        const lx = ns ? x + c1 + 0.01 : x + 0.78, ly = ns ? y + 0.78 : y + c1 + 0.01;
        const pnt = P3(lx, ly, zb + Math.min(h - 4, 26));
        ctx.fillStyle = bo.state.hasCard ? '#6ef096' : '#ff4d4d';
        ctx.fillRect(pnt[0] - 2, pnt[1] - 2, 4, 4);
      }
      return;
    }

    const parts = [];
    if (n) parts.push([x + c0, y, x + c1, y + c0]);
    if (w) parts.push([x, y + c0, x + c0, y + c1]);
    parts.push([x + c0, y + c0, x + c1, y + c1]);
    if (e) parts.push([x + c1, y + c0, x + 1, y + c1]);
    if (s) parts.push([x + c0, y + c1, x + c1, y + 1]);
    for (const [a0, b0, a1, b1] of parts) {
      if (t.window && h > 30) {
        box(a0, b0, a1, b1, zb, zb + 14, top, left, right);
        const glass = 'rgba(110,160,178,' + (bo.state.vis[k] === 2 ? 0.35 : 0.15) + ')';
        box(a0, b0, a1, b1, zb + 14, zb + 32, null, glass, glass);
        box(a0, b0, a1, b1, zb + 32, zb + h, top, left, right);
      } else {
        box(a0, b0, a1, b1, zb, zb + h, top, left, right);
      }
    }
  }

  function drawFence(x, y, lv, t, k) {
    const zb = lv * STOREY;
    const conn = (xx, yy) => { const tt = tile(xx, yy, lv); return !!(tt && tt.fence); };
    const cx = x + 0.5, cy = y + 0.5;
    const arms = [];
    if (conn(x, y - 1)) arms.push([cx, y, cx, cy]);
    if (conn(x - 1, y)) arms.push([x, cy, cx, cy]);
    if (conn(x + 1, y)) arms.push([cx, cy, x + 1, cy]);
    if (conn(x, y + 1)) arms.push([cx, cy, cx, y + 1]);
    const a = bo.state.vis[k] === 2 ? 1 : 0.5;
    ctx.globalAlpha = a;
    const z0 = t.cut ? FENCE_H * 0.58 : 0;
    for (const [ax, ay, bx, by] of arms) {
      const pts = [P3(ax, ay, zb + z0), P3(bx, by, zb + z0), P3(bx, by, zb + FENCE_H), P3(ax, ay, zb + FENCE_H)];
      poly(pts, 'rgba(120,138,138,0.1)');
      ctx.fillStyle = meshPattern;
      ctx.fill();
      ctx.strokeStyle = t.gate ? '#8a9795' : '#6e7c7a';
      ctx.lineWidth = t.gate ? 2 : 1.4;
      ctx.beginPath();
      ctx.moveTo(pts[3][0], pts[3][1]); ctx.lineTo(pts[2][0], pts[2][1]);
      if (!t.cut) { ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[1][0], pts[1][1]); }
      if (t.gate) { ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[2][0], pts[2][1]); }
      ctx.stroke();
      // wire along the top
      ctx.strokeStyle = 'rgba(160,172,170,0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) {
        const u = i / 6, px = ax + (bx - ax) * u, py = ay + (by - ay) * u;
        const q = P3(px, py, zb + FENCE_H + 4 + (i % 2 ? 3 : 0));
        if (i === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]);
      }
      ctx.stroke();
    }
    if (t.cut) {
      // the flap of wire, peeled back
      const f = [P3(cx - 0.3, cy + 0.1, zb + z0), P3(cx + 0.3, cy + 0.1, zb + z0), P3(cx + 0.18, cy + 0.42, zb + 2), P3(cx - 0.2, cy + 0.4, zb + 2)];
      poly(f, 'rgba(120,138,138,0.12)');
      ctx.fillStyle = meshPattern; ctx.fill();
    }
    const post = shade([96, 106, 106], k), postD = shade([70, 78, 78], k);
    box(cx - 0.04, cy - 0.04, cx + 0.04, cy + 0.04, zb, zb + FENCE_H + 6, post, post, postD);
    if (t.gate) {
      const q = P3(cx, cy, zb + FENCE_H + 10);
      ctx.fillStyle = bo.state.alarm && Math.sin(time * 8) > 0 ? '#ff4040' : '#7a2020';
      ctx.beginPath(); ctx.arc(q[0], q[1], 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawRail(x, y, lv, k) {
    const zb = lv * STOREY;
    const conn = (xx, yy) => { const tt = tile(xx, yy, lv); return !!(tt && tt.rail); };
    const cx = x + 0.5, cy = y + 0.5;
    const col = shade([130, 138, 136], k), dk = shade([90, 96, 96], k);
    // the platform's deck runs under the railing
    const arms = [];
    if (conn(x, y - 1)) arms.push([cx, y, cx, cy]);
    if (conn(x - 1, y)) arms.push([x, cy, cx, cy]);
    if (conn(x + 1, y)) arms.push([cx, cy, x + 1, cy]);
    if (conn(x, y + 1)) arms.push([cx, cy, cx, y + 1]);
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath();
    for (const [ax, ay, bx, by] of arms) {
      const a = P3(ax, ay, zb + RAIL_H), b = P3(bx, by, zb + RAIL_H);
      ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
      const c = P3(ax, ay, zb + RAIL_H / 2), d = P3(bx, by, zb + RAIL_H / 2);
      ctx.moveTo(c[0], c[1]); ctx.lineTo(d[0], d[1]);
    }
    ctx.stroke();
    box(cx - 0.035, cy - 0.035, cx + 0.035, cy + 0.035, zb, zb + RAIL_H + 2, col, col, dk);
  }

  function drawCrate(x, y, lv, k) {
    const zb = lv * STOREY;
    const x0 = x + 0.17, y0 = y + 0.17, x1 = x + 0.83, y1 = y + 0.83, z1 = zb + CRATE_H;
    box(x0, y0, x1, y1, zb, z1, shade([116, 108, 92], k), shade([88, 81, 68], k), shade([72, 66, 56], k));
    ctx.strokeStyle = shade([52, 47, 40], k);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    // an X brace on each face we see, and a board line across the lid
    let a = P3(x0, y1, zb), b = P3(x1, y1, z1), c = P3(x1, y1, zb), d = P3(x0, y1, z1);
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.moveTo(c[0], c[1]); ctx.lineTo(d[0], d[1]);
    a = P3(x1, y0, zb); b = P3(x1, y1, z1); c = P3(x1, y1, zb); d = P3(x1, y0, z1);
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.moveTo(c[0], c[1]); ctx.lineTo(d[0], d[1]);
    a = P3(x0, (y0 + y1) / 2, z1); b = P3(x1, (y0 + y1) / 2, z1);
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
    ctx.stroke();
    poly([P3(x0, y0, z1), P3(x1, y0, z1), P3(x1, y1, z1), P3(x0, y1, z1)], null, shade([60, 55, 46], k), 1);
  }

  function drawTerminal(x, y, lv, k) {
    const zb = lv * STOREY;
    box(x + 0.1, y + 0.2, x + 0.9, y + 0.8, zb, zb + 14, shade([96, 104, 106], k), shade([68, 74, 76], k), shade([56, 62, 64], k));
    box(x + 0.28, y + 0.36, x + 0.72, y + 0.46, zb + 14, zb + 33, shade([54, 60, 64], k), shade([40, 46, 50], k), shade([34, 38, 42], k));
    const on = bo.state.dataDone ? [110, 240, 150] : [127, 232, 255];
    const pulse = 0.75 + 0.25 * Math.sin(time * 3);
    poly([P3(x + 0.31, y + 0.461, zb + 17), P3(x + 0.69, y + 0.461, zb + 17), P3(x + 0.69, y + 0.461, zb + 31), P3(x + 0.31, y + 0.461, zb + 31)], rgba(on, 0.85 * pulse));
    box(x + 0.3, y + 0.55, x + 0.7, y + 0.68, zb + 14, zb + 16, shade([70, 76, 80], k), null, null);
  }

  function drawStairs(x, y, lv, k) {
    const zb = lv * STOREY;
    for (let i = 5; i >= 0; i--) {
      const x0 = x + 1 - (i + 1) / 6, x1 = x + 1 - i / 6;
      box(x0, y + 0.1, x1, y + 0.9, zb, zb + ((i + 1) * STOREY) / 6, shade([112, 124, 120], k), shade([74, 84, 82], k), shade([62, 72, 70], k));
    }
  }

  // two rails and rungs up the face between the top tile and the foot, hooks over the edge
  function drawLadder(l) {
    const [tx, ty, tl] = l.top, [fx, fy] = l.foot;
    const k = key(fx, fy, 0);
    const alongX = fx !== tx;                     // the ladder stands on the face between them
    const face = alongX ? Math.max(tx, fx) : Math.max(ty, fy);
    const c = (alongX ? ty : tx) + 0.5;
    const topZ = tl * STOREY + 10;
    const pt = (u, z) => (alongX ? P3(face + 0.02, c + u, z) : P3(c + u, face + 0.02, z));
    const rail = shade([150, 128, 92], k), rung = shade([122, 104, 76], k);
    ctx.lineCap = 'round';
    ctx.strokeStyle = rail; ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (const u of [-0.17, 0.17]) { const a = pt(u, 0), b = pt(u, topZ); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.stroke();
    ctx.strokeStyle = rung; ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let z = 6; z < topZ - 2; z += 8) { const a = pt(-0.17, z), b = pt(0.17, z); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  function bulbPoint(l) {
    const zb = l.lv * STOREY;
    if (l.kind === 'post') return P3(l.x + 0.5 + l.ax * 0.32, l.y + 0.5 + l.ay * 0.32, zb + POST_H - 4);
    if (l.kind === 'wall') { const [px, py] = lampPoint(l); const mx = l.mx + 0.5 + (l.x - l.mx) * (WT + 0.1), my = l.my + 0.5 + (l.y - l.my) * (WT + 0.1); return P3(mx, my, zb + 36); }
    return P3(l.x + 0.5, l.y + 0.5, zb + WALL_H + 3);
  }

  function drawLamp(l) {
    const zb = l.lv * STOREY;
    const k = key(l.x, l.y, l.lv);
    const metal = shade([64, 70, 70], k), metalD = shade([48, 53, 53], k);
    const b = bulbPoint(l);
    if (l.kind === 'post') {
      const cx = l.x + 0.5, cy = l.y + 0.5;
      box(cx - 0.05, cy - 0.05, cx + 0.05, cy + 0.05, zb, zb + POST_H, metal, metal, metalD);
      const top = P3(cx, cy, zb + POST_H);
      ctx.strokeStyle = metal; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.lineTo(b[0], b[1] - 3); ctx.stroke();
      ctx.fillStyle = metalD;
      ctx.beginPath(); ctx.ellipse(b[0], b[1] - 2, 7, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    } else if (l.kind === 'wall') {
      ctx.fillStyle = metalD;
      ctx.fillRect(b[0] - 5, b[1] - 5, 10, 5);
    } else {
      const a = P3(l.x + 0.3, l.y + 0.5, zb + WALL_H + 3), c = P3(l.x + 0.7, l.y + 0.5, zb + WALL_H + 3);
      ctx.strokeStyle = l.alive ? '#e8f4ef' : '#4a5352'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); ctx.stroke();
      return;
    }
    ctx.fillStyle = l.alive ? '#fff1c8' : '#3a3f3e';
    ctx.beginPath(); ctx.ellipse(b[0], b[1], 4, 2, 0, 0, Math.PI * 2); ctx.fill();
  }

  function drawGlows() {
    ctx.globalCompositeOperation = 'lighter';
    for (const l of bo.state.lamps) {
      if (!l.alive) continue;
      const mx = l.kind === 'wall' ? l.mx : l.x, my = l.kind === 'wall' ? l.my : l.y;
      if (l.lv > 0) { const r = regionOf(mx, my, l.lv); if (!r || !regionShown(r)) continue; }
      else if (roofedOver(mx, my)) continue;
      const b = bulbPoint(l);
      const warm = l.kind === 'ceil' ? '200,236,230' : '255,214,140';
      const rr = l.kind === 'ceil' ? 22 : 30;
      const g = ctx.createRadialGradient(b[0], b[1], 0, b[0], b[1], rr);
      g.addColorStop(0, 'rgba(' + warm + ',0.55)');
      g.addColorStop(1, 'rgba(' + warm + ',0)');
      ctx.fillStyle = g;
      ctx.fillRect(b[0] - rr, b[1] - rr, rr * 2, rr * 2);
    }
    for (const g of bo.state.guards) {
      if (g.down || g.carried) continue;
      if (g.lv > 0) { const r = regionOf(g.x, g.y, g.lv); if (!r || !regionShown(r)) continue; }
      else if (roofedOver(g.x, g.y)) continue;
      const t = torchPoint(g);
      const gr = ctx.createRadialGradient(t[0], t[1], 0, t[0], t[1], 12);
      gr.addColorStop(0, 'rgba(255,236,180,0.8)');
      gr.addColorStop(1, 'rgba(255,236,180,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(t[0] - 12, t[1] - 12, 24, 24);
    }
    if (bo.state.dataDone && bo.state.mode === 'play') {
      // the way out, green through the dark
      const v = P3(bo.CUT.x + 0.5, bo.CUT.y + 0.5, 0);
      const rr = 46 + Math.sin(time * 3) * 8;
      const gr = ctx.createRadialGradient(v[0], v[1] - 10, 0, v[0], v[1] - 10, rr);
      gr.addColorStop(0, 'rgba(110,240,150,0.7)');
      gr.addColorStop(1, 'rgba(110,240,150,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(v[0] - rr, v[1] - 10 - rr, rr * 2, rr * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawCamera(c) {
    const zb = c.lv * STOREY, k = key(c.x, c.y, c.lv);
    const bx = c.mx + 0.5 + (c.x - c.mx) * (WT + 0.08), by = c.my + 0.5 + (c.y - c.my) * (WT + 0.08);
    const base = P3(bx, by, zb + 38);
    const tipX = bx + Math.cos(c.ra) * 0.3, tipY = by + Math.sin(c.ra) * 0.3;
    const tip = P3(tipX, tipY, zb + (c.alive ? 36 : 30));
    ctx.strokeStyle = shade([96, 102, 106], k); ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = shade([40, 44, 48], k);
    ctx.beginPath(); ctx.arc(tip[0], tip[1], 3, 0, Math.PI * 2); ctx.fill();
    if (c.alive && Math.sin(time * 4 + c.x) > -0.3) {
      ctx.fillStyle = '#ff4646';
      ctx.beginPath(); ctx.arc(base[0], base[1] - 3, 1.8, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ---------- people ----------
  function screenFacing(ang) {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const sx = (dx - dy) * HW, sy = (dx + dy) * HH;
    const m = Math.hypot(sx, sy) || 1;
    return [sx / m, sy / m];
  }

  function torchPoint(g) {
    const zb = g.rl * STOREY;
    const [fx, fy] = screenFacing(g.ra);
    const f = P3(g.rx + 0.5, g.ry + 0.5, zb);
    return [f[0] + fx * 10, f[1] - 17 + fy * 4];
  }

  function drawPerson(fx0, fy0, ang, look, walk) {
    const [fx, fy] = screenFacing(ang);
    const toward = fy > -0.15;               // turned more to us than away
    const bob = Math.abs(Math.sin(walk * Math.PI)) * 1.5;
    const sw = Math.sin(walk * Math.PI) * 2.2;
    const x = fx0, y = fy0 - bob;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(fx0, fy0, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
    // legs
    ctx.fillStyle = look.legs;
    ctx.fillRect(x - 5, y - 12 + sw * 0.3, 4, 11 - sw * 0.3);
    ctx.fillRect(x + 1, y - 12 - sw * 0.3, 4, 11 + sw * 0.3);
    ctx.fillStyle = look.boots;
    ctx.fillRect(x - 5.5, y - 2 + Math.max(0, sw) * 0.3, 5, 2.5);
    ctx.fillRect(x + 0.5, y - 2 - Math.min(0, sw) * 0.3, 5, 2.5);
    // arms behind the body when facing away
    const armL = () => { ctx.fillStyle = look.body; ctx.fillRect(x - 10, y - 23, 3.5, 11); };
    const armR = () => { ctx.fillStyle = look.body; ctx.fillRect(x + 6.5, y - 23, 3.5, 11); };
    if (!toward) { armL(); armR(); }
    // body
    ctx.fillStyle = look.body;
    roundRect(x - 7, y - 25, 14, 15, 4); ctx.fill();
    ctx.fillStyle = look.vest;
    roundRect(x - 5.5, y - 23.5, 11, 9, 3); ctx.fill();
    ctx.fillStyle = look.belt;
    ctx.fillRect(x - 7, y - 13.5, 14, 2);
    if (look.pack && !toward) { ctx.fillStyle = look.pack; roundRect(x - 5, y - 24, 10, 10, 2.5); ctx.fill(); }
    if (toward) { armL(); armR(); }
    // what is in the hand, pointing where he faces
    ctx.strokeStyle = look.gear; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x + fx * 4, y - 17); ctx.lineTo(x + fx * 11, y - 17 + fy * 4); ctx.stroke();
    // head
    const hx = x + fx * 1.2, hy = y - 30;
    ctx.fillStyle = toward ? look.skin : look.hat;
    ctx.beginPath(); ctx.arc(hx, hy, 5.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = look.hat;
    ctx.beginPath(); ctx.arc(hx, hy - 1, 5.9, Math.PI, 0); ctx.fill();
    if (look.brim) {
      ctx.fillRect(hx - 6 + fx * 2, hy - 2, 12, 2);
    }
    if (toward) {
      if (look.goggles) {
        const on = look.goggles === 'on';
        ctx.fillStyle = on ? '#9dffbe' : '#2f7a4a';
        for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(hx + fx * 2.5 + i * 2.6, hy - 2.5, 1.3, 0, Math.PI * 2); ctx.fill(); }
        if (on) {
          ctx.globalCompositeOperation = 'lighter';
          const g = ctx.createRadialGradient(hx + fx * 2.5, hy - 2.5, 0, hx + fx * 2.5, hy - 2.5, 9);
          g.addColorStop(0, 'rgba(120,255,160,0.55)'); g.addColorStop(1, 'rgba(120,255,160,0)');
          ctx.fillStyle = g; ctx.fillRect(hx - 12, hy - 14, 24, 24);
          ctx.globalCompositeOperation = 'source-over';
        }
      } else {
        ctx.fillStyle = '#1d2224';
        ctx.fillRect(hx + fx * 2.4 - 2.6, hy - 0.5, 1.6, 1.6);
        ctx.fillRect(hx + fx * 2.4 + 1, hy - 0.5, 1.6, 1.6);
      }
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  const SPY = { legs: '#1f2d25', boots: '#141a17', body: '#2c4538', vest: '#3a5a48', belt: '#18201c', pack: '#22352b', gear: '#101414', skin: '#c9a080', hat: '#1e2c25', goggles: 'off' };
  const GUARD = { legs: '#3a4448', boots: '#1c2124', body: '#5c6b70', vest: '#46545a', belt: '#262d30', gear: '#20262a', skin: '#c49474', hat: '#2e373b', brim: true };

  function drawPlayer() {
    const p = bo.state.player;
    const f = P3(p.rx + 0.5, p.ry + 0.5, p.rl * STOREY);
    if (bo.state.dragging) {
      const g = bo.state.dragging;
      const [fx, fy] = screenFacing(DIR_A[p.face]);
      drawLying(f[0] - fx * 12, f[1] - fy * 6, DIR_A[p.face], g);
    }
    SPY.goggles = bo.state.nv ? 'on' : 'off';
    drawPerson(f[0], f[1], DIR_A[p.face], SPY, p.walk);
  }

  function drawGuard(g) {
    const f = P3(g.rx + 0.5, g.ry + 0.5, g.rl * STOREY);
    drawPerson(f[0], f[1], g.ra, GUARD, g.walk);
    // the facing caret over his head
    const [fx, fy] = screenFacing(g.ra);
    const cx = f[0], cy = f[1] - 48;
    ctx.fillStyle = 'rgba(16,22,24,0.75)';
    ctx.beginPath(); ctx.arc(cx, cy, 7.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = g.mode === 'hunt' ? '#ff8a80' : '#f2f6f5';
    ctx.lineWidth = 2;
    const px = -fy, py = fx;
    ctx.beginPath();
    ctx.moveTo(cx - fx * 1.5 + px * 4, cy - fy * 1.5 + py * 4);
    ctx.lineTo(cx + fx * 3.5, cy + fy * 3.5);
    ctx.lineTo(cx - fx * 1.5 - px * 4, cy - fy * 1.5 - py * 4);
    ctx.stroke();
    // the keycard he carries: a cyan card beside his caret and a glint at his belt
    if (g.card) {
      const pulse = 0.7 + 0.3 * Math.sin(time * 4);
      ctx.fillStyle = 'rgba(16,22,24,0.8)';
      ctx.fillRect(cx + 9, cy - 6, 14, 11);
      ctx.fillStyle = 'rgba(143,240,255,' + pulse + ')';
      ctx.fillRect(cx + 10.5, cy - 4.5, 11, 8);
      ctx.fillStyle = '#0e2a30';
      ctx.fillRect(cx + 12, cy - 3, 4, 2.5);
      ctx.fillStyle = 'rgba(143,240,255,' + pulse + ')';
      ctx.fillRect(f[0] + 3, f[1] - 14, 4, 3);
    }
  }

  function drawLying(x, y, ang, g) {
    const [fx, fy] = screenFacing(ang + Math.PI / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(x, y, 14, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = GUARD.body; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - fx * 9, y - fy * 5 - 3); ctx.lineTo(x + fx * 5, y + fy * 3 - 3); ctx.stroke();
    ctx.strokeStyle = GUARD.legs; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(x + fx * 5, y + fy * 3 - 3); ctx.lineTo(x + fx * 13, y + fy * 7 - 2); ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = GUARD.hat;
    ctx.beginPath(); ctx.arc(x - fx * 13, y - fy * 7 - 3, 4.5, 0, Math.PI * 2); ctx.fill();
    if (g.card) {
      ctx.fillStyle = '#8ff0ff';
      ctx.fillRect(x + 4, y - 9, 6, 4);
    }
  }

  function drawBody(g) {
    const f = P3(g.rx + 0.5, g.ry + 0.5, g.rl * STOREY);
    ctx.globalAlpha = bo.state.vis[key(g.x, g.y, g.lv)] === 2 ? 1 : 0.5;
    if (g.dead) {
      ctx.fillStyle = 'rgba(96,14,18,0.75)';
      ctx.beginPath(); ctx.ellipse(f[0] + 3, f[1] + 1, 15, 7, 0, 0, Math.PI * 2); ctx.fill();
    }
    drawLying(f[0], f[1], DIR_A[g.face], g);
    if (!g.dead) {
      ctx.fillStyle = 'rgba(220,230,228,' + (0.55 + 0.25 * Math.sin(time * 2 + g.id)) + ')';
      ctx.font = 'bold 10px "Share Tech Mono", monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('z', f[0] + 8, f[1] - 16 - 2 * Math.sin(time * 2));
      ctx.fillText('z', f[0] + 13, f[1] - 23 - 2 * Math.sin(time * 2 + 1));
    }
    ctx.globalAlpha = 1;
  }

  // ---------- previews, tracers and labels ----------
  function drawPathPreview() {
    if (!canAct() || hover.obj || hover.tile < 0) return;
    const k = resolveTarget(hover.tile);
    if (!bo.state.reach || bo.state.reach.dist[k] <= 0) return;
    const e = P3(kx(k) + 0.5, ky(k) + 0.5, kl(k) * STOREY);
    ctx.strokeStyle = bo.state.danger[k] ? '#ff9a90' : '#f2f6f8';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(e[0], e[1], 11, 5.5, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath(); ctx.ellipse(e[0], e[1], 3.5, 1.8, 0, 0, Math.PI * 2); ctx.fill();
  }

  // a faded card where the carrier was last seen, once he has gone back into the dark
  function drawCardGhost() {
    const at = bo.state.cardSeenAt;
    if (!at || bo.state.hasCard) return;
    const g = bo.state.guards.find((q) => q.card);
    if (g && bo.state.vis[key(g.x, g.y, g.lv)] === 2) return;
    const c = P3(at[0] + 0.5, at[1] + 0.5, at[2] * STOREY);
    ctx.globalAlpha = 0.55 + 0.2 * Math.sin(time * 3);
    ctx.fillStyle = 'rgba(16,22,24,0.8)';
    ctx.fillRect(c[0] - 8, c[1] - 16, 16, 12);
    ctx.fillStyle = '#8ff0ff';
    ctx.fillRect(c[0] - 6.5, c[1] - 14.5, 13, 9);
    ctx.fillStyle = '#0e2a30';
    ctx.fillRect(c[0] - 5, c[1] - 13, 4.5, 3);
    ctx.strokeStyle = 'rgba(143,240,255,0.7)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.ellipse(c[0], c[1], 14, 7, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // where a guard who thinks he saw you is going to look
  function drawInvestigations() {
    for (const g of bo.state.guards) {
      if (g.down || g.mode !== 'suspect' || !g.target) continue;
      if (bo.state.vis[key(g.x, g.y, g.lv)] !== 2) continue;
      const [x, y, lv] = g.target;
      if (lv > 0) { const r = regionOf(x, y, lv); if (!r || !regionShown(r)) continue; }
      const c = P3(x + 0.5, y + 0.5, lv * STOREY);
      ctx.strokeStyle = 'rgba(231,185,74,' + (0.55 + 0.25 * Math.sin(time * 4)) + ')';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.ellipse(c[0], c[1], 20, 10, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(231,185,74,0.9)';
      ctx.font = 'bold 14px "Share Tech Mono", monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('?', c[0], c[1] - 1);
    }
  }

  function targetAnchor(t) {
    if (t.kind === 'lamp') {
      const b = bulbPoint(t.o);
      return { sx: b[0], sy: b[1] };
    }
    if (t.kind === 'cam') {
      const c = t.o;
      const bx = c.mx + 0.5 + (c.x - c.mx) * (WT + 0.08), by = c.my + 0.5 + (c.y - c.my) * (WT + 0.08);
      const q = P3(bx, by, c.lv * STOREY + 38);
      return { sx: q[0], sy: q[1] };
    }
    const g = t.o;
    const q = P3(g.rx + 0.5, g.ry + 0.5, g.rl * STOREY + 20);
    return { sx: q[0], sy: q[1] };
  }

  function endPoint(a) {
    if (a.sx !== undefined) return [a.sx, a.sy];
    return P3(a[0] + 0.5, a[1] + 0.5, a[2] * STOREY + a[3]);
  }

  function drawTracers() {
    const p = bo.state.player;
    // the laser onto whatever the next round would hit
    const aimT = bo.state.aim || (hover.obj && !fireCheck(hover.obj) ? hover.obj : null);
    if (aimT && canAct()) {
      const a = P3(p.rx + 0.5, p.ry + 0.5, p.rl * STOREY + 20), b = endPoint(targetAnchor(aimT));
      ctx.strokeStyle = 'rgba(255,70,70,0.6)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      ctx.fillStyle = '#ff5050';
      ctx.beginPath(); ctx.arc(b[0], b[1], 2.5, 0, Math.PI * 2); ctx.fill();
    }
    for (const g of bo.state.guards) {
      if (!g.aiming || g.down || bo.state.mode !== 'play') continue;
      if (g.lv > 0) { const r = regionOf(g.x, g.y, g.lv); if (!r || !regionShown(r)) continue; }
      const a = P3(g.rx + 0.5, g.ry + 0.5, g.rl * STOREY + 20), b = P3(p.rx + 0.5, p.ry + 0.5, p.rl * STOREY + 20);
      ctx.strokeStyle = 'rgba(255,60,60,' + (0.55 + 0.3 * Math.sin(time * 10)) + ')';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    for (const f of bo.state.fx) {
      if (f.kind !== 'tracer') continue;
      const a = endPoint(f.from), b = endPoint(f.to);
      const k = 1 - f.t / f.life;
      ctx.strokeStyle = 'rgba(' + f.col + ',' + k + ')';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      ctx.fillStyle = 'rgba(255,240,200,' + k + ')';
      ctx.beginPath(); ctx.arc(a[0], a[1], 4 * k + 1, 0, Math.PI * 2); ctx.fill();
    }
  }

  function bubble(sx, sy, text, tone) {
    ctx.font = Math.round(14 * dpr) + 'px "Share Tech Mono", ui-monospace, monospace';
    const s = text.toUpperCase();
    const w = ctx.measureText(s).width + 18 * dpr, h = 26 * dpr;
    const x = Math.round(sx - w / 2), y = Math.round(sy - h - 10 * dpr);
    ctx.fillStyle = 'rgba(20,26,28,0.92)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = tone === 'bad' ? '#d8474a' : tone === 'good' ? '#6ef096' : '#8c9a97';
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = ctx.fillStyle = 'rgba(20,26,28,0.92)';
    ctx.beginPath(); ctx.moveTo(sx - 6 * dpr, y + h); ctx.lineTo(sx, y + h + 7 * dpr); ctx.lineTo(sx + 6 * dpr, y + h); ctx.fill();
    ctx.beginPath(); ctx.moveTo(sx - 6 * dpr, y + h); ctx.lineTo(sx, y + h + 7 * dpr); ctx.lineTo(sx + 6 * dpr, y + h); ctx.stroke();
    ctx.fillStyle = tone === 'bad' ? '#ffb3b3' : '#e6eeec';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s, sx, y + h / 2 + dpr);
  }

  function drawScreenUI() {
    const z = viewScale();
    const W2S = (q) => worldToScreen(q[0], q[1]);
    // markers over guards
    for (const g of bo.state.guards) {
      if (g.down || !g.marker) continue;
      if (bo.state.vis[key(g.x, g.y, g.lv)] !== 2) continue;
      if (g.lv > 0) { const r = regionOf(g.x, g.y, g.lv); if (!r || !regionShown(r)) continue; }
      const q = W2S(P3(g.rx + 0.5, g.ry + 0.5, g.rl * STOREY));
      const s = 9 * dpr;
      const x = q[0] + 14 * z, y = q[1] - 50 * z;
      ctx.fillStyle = g.marker === '!' ? '#d8474a' : '#e7b94a';
      ctx.fillRect(x - s, y - s, s * 2, s * 2);
      ctx.fillStyle = '#101416';
      ctx.font = 'bold ' + Math.round(14 * dpr) + 'px "Share Tech Mono", monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(g.marker, x, y + dpr);
    }
    // floating words
    for (const f of bo.state.fx) {
      if (f.kind !== 'text') continue;
      const q = W2S(P3(f.x + 0.5, f.y + 0.5, f.lv * STOREY + 44));
      const k = f.t / f.life;
      ctx.globalAlpha = 1 - k * k;
      ctx.font = Math.round(15 * dpr) + 'px "Share Tech Mono", monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#0b0f10';
      ctx.fillText(f.text, q[0] + dpr, q[1] - k * 26 * dpr + dpr);
      ctx.fillStyle = f.col;
      ctx.fillText(f.text, q[0], q[1] - k * 26 * dpr);
      ctx.globalAlpha = 1;
    }
    if (bo.state.mode !== 'play') return;
    // what Z would do, over the thing it would do it to
    const a = idle() ? contextAction() : null;
    let shown = false;
    if (a) {
      let q;
      if (a.kind === 'takedown') q = P3(a.g.rx + 0.5, a.g.ry + 0.5, a.g.rl * STOREY + 58);
      else if (a.kind === 'hack') q = P3(a.x + 0.5, a.y + 0.5, a.lv * STOREY + 40);
      else q = P3(a.x + 0.5, a.y + 0.5, a.lv * STOREY + 46);
      const s = W2S(q);
      bubble(s[0], s[1], a.label, a.kind === 'locked' ? 'bad' : null);
      shown = true;
    }
    // what a click would do, at the cursor
    if (canAct() && hover.obj) {
      const o = hover.obj;
      let text, tone;
      if (o.kind === 'guard' && canTakedown(o.o)) { text = 'Take down'; }
      else {
        const why = fireCheck(o);
        text = why ? why : 'Fire · ' + bo.state.rounds + ' left';
        tone = why ? 'bad' : null;
      }
      const an = targetAnchor(o);
      const s = W2S([an.sx, an.sy - 10]);
      if (!(shown && o.kind === 'guard' && a && a.kind === 'takedown')) bubble(s[0], s[1], text, tone);
    } else if (canAct() && hover.tile >= 0) {
      const k = resolveTarget(hover.tile);
      if (bo.state.reach.dist[k] > 0 && bo.state.danger[k]) {
        const s = W2S(P3(kx(k) + 0.5, ky(k) + 0.5, kl(k) * STOREY + 8));
        bubble(s[0], s[1], 'Seen here', 'bad');
      }
    }
    // each arrow key's cap, on the tile that key would take you to
    if (idle()) {
      const caps = [['up', '↑'], ['down', '↓'], ['left', '←'], ['right', '→']];
      ctx.font = Math.round(12 * dpr) + 'px "Share Tech Mono", monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const [name, glyph] of caps) {
        const k = arrowTarget(name);
        if (k < 0) continue;
        const q = W2S(P3(kx(k) + 0.5, ky(k) + 0.5, kl(k) * STOREY));
        const h = 8 * dpr;
        ctx.fillStyle = 'rgba(16,22,24,0.7)';
        ctx.fillRect(q[0] - h, q[1] - h, h * 2, h * 2);
        ctx.strokeStyle = 'rgba(200,215,212,0.55)';
        ctx.lineWidth = dpr;
        ctx.strokeRect(q[0] - h + 0.5, q[1] - h + 0.5, h * 2 - 1, h * 2 - 1);
        ctx.fillStyle = 'rgba(230,238,236,0.9)';
        ctx.fillText(glyph, q[0], q[1] + dpr * 0.5);
      }
    }
  }

  // ---------- animation ----------
  function animate(dt) {
    time += dt;
    const ease = (a, b, rate) => a + (b - a) * Math.min(1, dt * rate);
    const move = (e) => {
      const d = Math.hypot(e.x - e.rx, e.y - e.ry) + Math.abs(e.lv - e.rl);
      e.rx = ease(e.rx, e.x, 16); e.ry = ease(e.ry, e.y, 16); e.rl = ease(e.rl, e.lv, 12);
      if (d > 0.03) e.walk += dt * 6; else e.walk = Math.round(e.walk);
    };
    if (!bo.state) return;
    move(bo.state.player);
    for (const g of bo.state.guards) {
      if (!g.carried) move(g);
      const want = DIR_A[g.face];
      g.ra += Math.atan2(Math.sin(want - g.ra), Math.cos(want - g.ra)) * Math.min(1, dt * 12);
    }
    for (const c of bo.state.cams) c.ra += (c.a - c.ra) * Math.min(1, dt * 8);
    for (const f of bo.state.fx) f.t += dt;
    bo.state.fx = bo.state.fx.filter((f) => f.t < f.life);
    if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) el.msg.className = 'msg'; }
    // the camera follows you, unless you have dragged it away
    const p = bo.state.player;
    const tx = PX(p.rx + 0.5, p.ry + 0.5), ty = PY(p.rx + 0.5, p.ry + 0.5, p.rl * STOREY) - 30;
    if (!cam.free) { cam.x = ease(cam.x, tx, 5); cam.y = ease(cam.y, ty, 5); }
  }

  // ---------- HUD ----------
  const el = {
    hud: document.getElementById('hud'),
    obj: document.getElementById('hud-obj'),
    light: document.getElementById('hud-light'),
    seen: document.getElementById('hud-seen'),
    seenLabel: document.getElementById('hud-seen-label'),
    rounds: document.getElementById('hud-rounds'),
    dots: document.getElementById('hud-dots'),
    hp: document.getElementById('hud-hp'),
    nv: document.getElementById('hud-nv'),
    msg: document.getElementById('msg'),
    turnbar: document.getElementById('turnbar'),
    turn: document.getElementById('tb-turn'),
    ap: document.getElementById('tb-ap'),
    run: document.getElementById('tb-run'),
    nvBtn: document.getElementById('tb-nv'),
    follow: document.getElementById('tb-follow'),
    use: document.getElementById('tb-use'),
    fire: document.getElementById('tb-fire'),
    title: document.getElementById('title'),
    titleBest: document.getElementById('title-best'),
    titleKicker: document.getElementById('title-kicker'),
    titleMissions: document.getElementById('title-missions'),
    titleMission: document.getElementById('title-mission'),
    endNext: document.getElementById('end-next'),
    hack: document.getElementById('hack'),
    hackStatus: document.getElementById('hack-status'),
    hackZone: document.getElementById('hack-zone'),
    hackMark: document.getElementById('hack-mark'),
    end_: document.getElementById('end'),
    endTitle: document.getElementById('end-title'),
    endBody: document.getElementById('end-body'),
    endCheckpoint: document.getElementById('end-checkpoint'),
    help: document.getElementById('help'),
    sound: document.getElementById('btn-sound'),
  };

  let hudKey = '';
  function updateHud() {
    if (!bo.state) return;
    const p = bo.state.player;
    const L = bo.state.light[key(p.x, p.y, p.lv)];
    const gait = bo.state.dragging ? 'Dragging' : bo.state.run ? 'Running' : 'Sneaking';
    const sig = [bo.state.phase, Math.round(L * 20), bo.state.seen, bo.state.alarm, bo.state.rounds, bo.state.hp, Math.round(bo.state.battery), bo.state.moves, gait, bo.state.nv, bo.state.mode].join('|');
    if (sig === hudKey) return;
    hudKey = sig;
    el.obj.textContent = bo.PHASES[bo.state.phase];
    el.hud.classList.toggle('escape', bo.state.phase === 'escape');
    el.hud.classList.toggle('alarm', bo.state.alarm);
    const lc = L >= LIT ? '#f2d888' : L >= SEE_LIGHT ? '#9c8f62' : '#3a4442';
    el.light.style.background = lc;
    el.light.style.boxShadow = L >= LIT ? '0 0 10px rgba(242,216,136,0.8)' : 'none';
    el.light.title = L >= LIT ? 'Lit — seen from across a cone' : L >= SEE_LIGHT ? 'Dim' : 'Dark — only a torch close up finds you';
    el.seen.style.width = 'calc(' + bo.state.seen + '% - 2px)';
    el.seenLabel.textContent = bo.state.alarm ? 'Alarm' : 'Seen';
    el.rounds.textContent = bo.state.rounds;
    const max = ROUNDS[bo.state.difficulty];
    if (el.dots.childElementCount !== max) {
      el.dots.innerHTML = '';
      el.dots.style.gridTemplateColumns = 'repeat(' + Math.ceil(max / 2) + ', 7px)';
      for (let i = 0; i < max; i++) el.dots.appendChild(document.createElement('i'));
    }
    Array.from(el.dots.children).forEach((d, i) => d.classList.toggle('spent', i >= bo.state.rounds));
    el.hp.style.width = (100 * bo.state.hp / START_HP) + '%';
    el.nv.style.width = bo.state.battery + '%';
    el.turn.textContent = 'Moves ' + bo.state.moves;
    el.ap.textContent = gait;
    el.ap.classList.toggle('loud', bo.state.run && !bo.state.dragging);
    el.run.setAttribute('aria-pressed', String(bo.state.run));
    el.nvBtn.setAttribute('aria-pressed', String(bo.state.nv));
    const busy = bo.state.mode !== 'play';
    [el.run, el.use, el.fire].forEach((b) => { b.disabled = busy; });
  }

  function showEnd(won) {
    el.end_.hidden = false;
    const rec = loadSave();
    const last = bo.missionI === MISSIONS.length - 1;
    if (won) {
      el.endTitle.textContent = last ? 'The last of them' : 'Out with the data';
      el.endBody.innerHTML =
        '<p>' + bo.mission.name + ': back through the wire in <b>' + bo.state.moves + ' moves</b> on ' + bo.state.difficulty + ', with ' + bo.state.rounds + ' of ' +
        ROUNDS[bo.state.difficulty] + ' rounds left.</p>' +
        '<p>' + (bo.state.earlyAlarm ? 'They were already looking for you before the download.' : 'Nobody raised the alarm until the download did. A clean run.') + '</p>' +
        '<p>' + (bo.state.newBest ? '<b>A new best</b> for ' + bo.state.difficulty + '.' : 'Best on ' + bo.state.difficulty + ': ' + bestOf(rec, bo.mission, bo.state.difficulty) + ' moves.') + '</p>' +
        (last ? '<p>That was the fifth compound. Every mission is open from the title.</p>'
          : '<p>Next: <b>' + MISSIONS[bo.missionI + 1].name + '</b>. ' + MISSIONS[bo.missionI + 1].brief + '</p>');
      el.endCheckpoint.hidden = true;
      el.endNext.hidden = last;
    } else {
      el.endTitle.textContent = 'Blackout';
      el.endBody.innerHTML = '<p>' + (bo.state.deathWhy || 'Shot') + '. ' +
        (bo.state.checkpoint ? 'The data was yours. The terminal is a checkpoint.' : 'The compound never saw the data leave.') + '</p>';
      el.endCheckpoint.hidden = !bo.state.checkpoint;
      el.endNext.hidden = true;
    }
  }
  function hideEnd() { el.end_.hidden = true; }

  // ---------- saving ----------
  // best: { missionId: { normal, hard } } in moves; unlocked: how many missions are open
  function loadSave() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (s && s.best) return s;
    } catch (e) { /* storage blocked */ }
    let rec = freshRecords();
    try {
      const old = JSON.parse(localStorage.getItem(OLD_SAVE_KEY) || 'null');
      if (old && old.best) {
        rec = fromV3(old, MISSIONS[0].id);
        writeSave(rec);
      }
      localStorage.removeItem(OLD_SAVE_KEY);
    } catch (e) { /* storage blocked */ }
    return rec;
  }
  function writeSave(s) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) { /* storage blocked */ }
  }

  function showTitle(mi) {
    const rec = loadSave();
    if (mi === undefined) mi = firstShow ? rec.last || 0 : bo.missionI;
    firstShow = false;
    newGame(bo.difficulty, clamp(mi, 0, (rec.unlocked || 1) - 1));
    bo.state.mode = 'title';
    el.title.hidden = false;
    hideEnd();
    el.hack.hidden = true;
    document.querySelectorAll('[data-diff]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.diff === bo.difficulty)));
    drawMissionPicker(rec);
  }
  let firstShow = true;

  // the five missions as numbered buttons; one you have not reached yet is locked
  function drawMissionPicker(rec) {
    rec = rec || loadSave();
    const open = rec.unlocked || 1;
    el.titleMissions.innerHTML = '';
    MISSIONS.forEach((m, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tiny';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(i === bo.missionI));
      b.textContent = String(i + 1);
      b.disabled = i >= open;
      b.title = i >= open ? 'Win mission ' + i + ' to open this one' : m.name;
      if (bestOf(rec, m, 'normal') || bestOf(rec, m, 'hard')) b.classList.add('done');
      b.addEventListener('click', () => pickMission(i));
      el.titleMissions.appendChild(b);
    });
    el.titleKicker.textContent = bo.mission.brief;
    el.titleMission.textContent = 'Mission ' + (bo.missionI + 1) + ' of ' + MISSIONS.length + ': ' + bo.mission.name;
    const bits = [];
    const bn = bestOf(rec, bo.mission, 'normal'), bh = bestOf(rec, bo.mission, 'hard');
    if (bn) bits.push('Best on normal: ' + bn + ' moves');
    if (bh) bits.push('Best on hard: ' + bh + ' moves');
    el.titleBest.textContent = bits.join(' · ');
  }

  function pickMission(i) {
    const rec = loadSave();
    if (i < 0 || i >= (rec.unlocked || 1)) return;
    newGame(bo.difficulty, i);
    bo.state.mode = 'title';
    cam.free = false;
    snapAll();
    drawMissionPicker(rec);
  }

  function nextMission() {
    if (bo.missionI >= MISSIONS.length - 1) { showTitle(); return; }
    showTitle(bo.missionI + 1);
    start();
  }

  function start() {
    begin();
    el.title.hidden = true;
    hideEnd();
    cam.free = false;
    ensureAudio();
  }

  // ---------- input ----------
  function pick(sx, sy) {
    const [wx, wy] = screenToWorld(sx, sy);
    let obj = null, bd = 20;
    const near = (q, t) => { const d = Math.hypot(q[0] - wx, q[1] - wy); if (d < bd) { bd = d; obj = t; } };
    for (const g of bo.state.guards) {
      if (g.down || g.carried || bo.state.vis[key(g.x, g.y, g.lv)] !== 2) continue;
      if (g.lv > 0) { const r = regionOf(g.x, g.y, g.lv); if (!r || !regionShown(r)) continue; }
      near(P3(g.rx + 0.5, g.ry + 0.5, g.rl * STOREY + 18), { kind: 'guard', o: g });
    }
    for (const l of bo.state.lamps) {
      if (!l.alive || l.lv !== bo.state.player.lv || bo.state.vis[key(l.x, l.y, l.lv)] === 0) continue;
      if (l.lv > 0 && !regionShown(regionOf(l.x, l.y, l.lv))) continue;
      near(bulbPoint(l), { kind: 'lamp', o: l });
    }
    for (const c of bo.state.cams) {
      if (!c.alive || c.lv !== bo.state.player.lv || bo.state.vis[key(c.x, c.y, c.lv)] === 0) continue;
      const a = targetAnchor({ kind: 'cam', o: c });
      near([a.sx, a.sy], { kind: 'cam', o: c });
    }
    let t = -1;
    const planes = bo.UPPER.filter((r) => regionShown(r)).map((r) => [r.lv, r]).concat([[0, null]]);
    for (const [lv, r] of planes) {
      const yy = wy + lv * STOREY;
      const gx = Math.floor((wx / HW + yy / HH) / 2), gy = Math.floor((yy / HH - wx / HW) / 2);
      if (!inb(gx, gy, lv) || !tile(gx, gy, lv)) continue;
      if (r && !inRegion(r, gx, gy)) continue;
      t = key(gx, gy, lv);
      break;
    }
    return { obj, tile: t };
  }

  function clickPick(pk) {
    if (!canAct()) return;
    if (pk.obj) {
      const o = pk.obj;
      if (o.kind === 'guard' && canTakedown(o.o)) { doAction({ kind: 'takedown', g: o.o }); return; }
      fire(o);
      return;
    }
    const k = pk.tile;
    if (k < 0) return;
    const x = kx(k), y = ky(k), lv = kl(k), c = ch(x, y, lv);
    const a = contextAction();
    if (a && a.x === x && a.y === y && a.lv === lv && a.kind !== 'drop') { doAction(a); return; }
    if (c === 'T' || c === 'D' || bodyAt(x, y, lv)) {
      if (bodyAt(x, y, lv) && bo.state.reach.dist[k] > 0) { moveTo(k); return; }
      // walk to the nearest reachable tile beside it
      let best = -1, bd = 99;
      for (const [dx, dy] of DIRS) {
        const n = key(x + dx, y + dy, lv);
        if (inb(x + dx, y + dy, lv) && bo.state.reach.dist[n] > 0 && bo.state.reach.dist[n] < bd) { bd = bo.state.reach.dist[n]; best = n; }
      }
      if (best >= 0) moveTo(best);
      return;
    }
    if (bo.state.reach.dist[k] > 0) moveTo(k);
    else if (k === pkey() && a) doAction(a);
  }

  // two fingers on a touch screen pinch the zoom (the wheel and +/- do it otherwise),
  // keeping the point between the fingers where it is, as the wheel does under the cursor
  const fingers = new Map();
  let pinch = null;
  const spread = () => { const [a, b] = [...fingers.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
  const endFinger = (e) => {
    fingers.delete(e.pointerId);
    if (pinch && fingers.size < 2) { pinch = null; press = null; canvas.classList.remove('pan'); }
  };
  canvas.addEventListener('pointercancel', endFinger);

  let press = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (fingers.size === 2) {
      const s = spread();
      pinch = { d: s.d || 1, zoom: cam.zoom };
      press = null;
      cam.free = true;
    } else if (!pinch) {
      press = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, panned: false, type: e.pointerType };
    }
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    if (fingers.has(e.pointerId)) fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch) {
      if (fingers.size < 2) return;
      const s = spread();
      const sx = (s.x - r.left) * dpr, sy = (s.y - r.top) * dpr;
      const before = screenToWorld(sx, sy);
      cam.zoom = clamp(pinch.zoom * s.d / pinch.d, 0.45, 2.2);
      const after = screenToWorld(sx, sy);
      cam.x += before[0] - after[0];
      cam.y += before[1] - after[1];
      return;
    }
    if (press) {
      const dx = e.clientX - press.x, dy = e.clientY - press.y;
      if (!press.panned && Math.hypot(dx, dy) > 7) { press.panned = true; canvas.classList.add('pan'); }
      if (press.panned) {
        cam.free = true;
        cam.x = press.cx - dx / cam.zoom;
        cam.y = press.cy - dy / cam.zoom;
        return;
      }
    }
    if (!bo.state || e.pointerType === 'touch') return;
    hover = pick((e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr);
    canvas.classList.toggle('aim', !!(hover.obj && canAct()));
  });
  canvas.addEventListener('pointerup', (e) => {
    const pinching = !!pinch;
    endFinger(e);
    if (pinching) return;
    const pr = press;
    press = null;
    canvas.classList.remove('pan');
    if (!pr || pr.panned || !bo.state) return;
    const r = canvas.getBoundingClientRect();
    const pk = pick((e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr);
    if (pr.type === 'touch') {
      // on a touch screen the first tap shows what would happen, the second does it
      const same = hover && ((pk.obj && hover.obj && pk.obj.o === hover.obj.o) || (!pk.obj && !hover.obj && pk.tile === hover.tile));
      hover = pk;
      if (!same) return;
    }
    clickPick(pk);
  });
  canvas.addEventListener('pointerleave', () => { if (!press) hover = { obj: null, tile: -1 }; });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const sx = (e.clientX - r.left) * dpr, sy = (e.clientY - r.top) * dpr;
    const before = screenToWorld(sx, sy);
    cam.zoom = clamp(cam.zoom * Math.exp(-e.deltaY * 0.0015), 0.45, 2.2);
    const after = screenToWorld(sx, sy);
    cam.x += before[0] - after[0];
    cam.y += before[1] - after[1];
    if (Math.abs(before[0] - after[0]) + Math.abs(before[1] - after[1]) > 0.5) cam.free = true;
  }, { passive: false });

  function zoomBy(f) { cam.zoom = clamp(cam.zoom * f, 0.45, 2.2); }

  const useKey = () => use();

  function fireKey() {
    if (!canAct()) return false;
    const list = targets();
    if (bo.state.aim && !fireCheck(bo.state.aim)) return fire(bo.state.aim);
    if (hover.obj && !fireCheck(hover.obj)) return fire(hover.obj);
    if (!list.length) { say(bo.state.rounds <= 0 ? 'Out of rounds' : 'Nothing in your line of fire'); return false; }
    bo.state.aim = list[0];
    say('X again to fire · Tab for another target');
    return false;
  }

  function cycleTarget() {
    if (!canAct()) return;
    const list = targets();
    if (!list.length) { bo.state.aim = null; say('Nothing in your line of fire'); return; }
    const i = bo.state.aim ? list.findIndex((t) => t.o === bo.state.aim.o) : -1;
    bo.state.aim = list[(i + 1) % list.length];
  }

  const KEYARROW = { ArrowUp: 'up', KeyW: 'up', ArrowRight: 'right', KeyD: 'right', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left' };
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!el.help.hidden) { if (e.code === 'Escape') el.help.hidden = true; return; }
    if (!bo.state) return;
    if (bo.state.mode === 'title') {
      if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); start(); }
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') setDifficulty(bo.difficulty === 'normal' ? 'hard' : 'normal');
      if (e.code === 'ArrowUp' || e.code === 'ArrowDown') { e.preventDefault(); pickMission(bo.missionI + (e.code === 'ArrowDown' ? 1 : -1)); }
      if (/^Digit[1-9]$/.test(e.code)) pickMission(+e.code.slice(5) - 1);
      return;
    }
    if (bo.state.mode === 'hack') {
      if (e.code === 'KeyZ' || e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); hackPress(); }
      if (e.code === 'Escape') leaveHack();
      return;
    }
    if (bo.state.mode === 'over' || bo.state.mode === 'won') {
      if (e.code === 'KeyZ' && bo.state.checkpoint && bo.state.mode === 'over') restoreCheckpoint();
      if (e.code === 'Enter') { if (bo.state.mode === 'won') nextMission(); else showTitle(); }
      return;
    }
    if (e.code in KEYARROW) { e.preventDefault(); stepDir(ARROW_DIR[KEYARROW[e.code]]); cam.free = false; return; }
    switch (e.code) {
      case 'Space': e.preventDefault(); stay(); break;
      case 'KeyZ': useKey(); break;
      case 'KeyX': fireKey(); break;
      case 'Tab': e.preventDefault(); cycleTarget(); break;
      case 'KeyR': toggleRun(); break;
      case 'KeyC': toggleNV(); break;
      case 'KeyF': cam.free = false; break;
      case 'Escape': bo.state.aim = null; stopWalk(); break;
      case 'Equal': case 'NumpadAdd': zoomBy(1.15); break;
      case 'Minus': case 'NumpadSubtract': zoomBy(1 / 1.15); break;
      default: return;
    }
  });

  el.run.addEventListener('click', toggleRun);
  el.nvBtn.addEventListener('click', toggleNV);
  el.follow.addEventListener('click', () => { cam.free = false; });
  document.getElementById('tb-stay').addEventListener('click', stay);
  el.use.addEventListener('click', useKey);
  el.fire.addEventListener('click', fireKey);
  document.getElementById('btn-start').addEventListener('click', start);
  document.getElementById('btn-new').addEventListener('click', () => showTitle());
  document.getElementById('end-again').addEventListener('click', () => showTitle());
  el.endNext.addEventListener('click', nextMission);
  el.endCheckpoint.addEventListener('click', restoreCheckpoint);
  document.getElementById('hack-press').addEventListener('click', hackPress);
  document.getElementById('hack-leave').addEventListener('click', leaveHack);
  document.getElementById('btn-help').addEventListener('click', () => { el.help.hidden = false; });
  document.querySelectorAll('[data-open="help"]').forEach((b) => b.addEventListener('click', () => { el.help.hidden = false; }));
  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { document.getElementById(b.dataset.close).hidden = true; }));
  el.help.addEventListener('click', (e) => { if (e.target === el.help) el.help.hidden = true; });
  document.querySelectorAll('[data-diff]').forEach((b) => b.addEventListener('click', () => setDifficulty(b.dataset.diff)));

  function setDifficulty(d) {
    bo.difficulty = d;
    try { localStorage.setItem(DIFF_KEY, d); } catch (e) { /* storage blocked */ }
    document.querySelectorAll('[data-diff]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.diff === d)));
    if (bo.state && bo.state.mode === 'title') { newGame(d); bo.state.mode = 'title'; drawMissionPicker(); }
  }

  // ---------- sound ----------
  let soundOn = false, actx = null;
  try { const v = localStorage.getItem(SOUND_KEY); soundOn = v === 'on' || v === '1'; } catch (e) { /* storage blocked */ }
  function ensureAudio() {
    if (!soundOn || actx) return;
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
  }
  function sfx(freq, dur, vol, type, delay) {
    if (!soundOn) return;
    ensureAudio();
    if (!actx) return;
    // born outside a gesture (a timer, a touch going down) it starts suspended; any later
    // sound inside a tap wakes it
    if (actx.state === 'suspended') actx.resume().catch(() => {});
    const t0 = actx.currentTime + (delay || 0);
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(actx.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, vol, freq) {
    if (!soundOn) return;
    ensureAudio();
    if (!actx) return;
    const n = Math.floor(actx.sampleRate * dur);
    const buf = actx.createBuffer(1, n, actx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
    s.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; g.gain.value = vol;
    s.connect(f).connect(g).connect(actx.destination);
    s.start();
  }
  const sfxStep = () => noise(0.05, bo.state.run ? 0.25 : 0.08, bo.state.run ? 900 : 500);
  const sfxShot = (loud) => noise(loud ? 0.25 : 0.12, loud ? 0.6 : 0.35, loud ? 700 : 1800);
  const sfxGlass = () => { noise(0.25, 0.25, 4200); sfx(2400, 0.1, 0.03, 'triangle', 0.02); };
  const sfxThud = () => { noise(0.15, 0.4, 180); sfx(90, 0.18, 0.08, 'sine'); };
  const sfxAlarm = () => { for (let i = 0; i < 4; i++) { sfx(620, 0.22, 0.05, 'sawtooth', i * 0.45); sfx(880, 0.22, 0.05, 'sawtooth', i * 0.45 + 0.22); } };
  el.sound.textContent = 'Sound: ' + (soundOn ? 'on' : 'off');
  el.sound.setAttribute('aria-pressed', String(soundOn));
  el.sound.addEventListener('click', () => {
    soundOn = !soundOn;
    try { localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off'); } catch (e) { /* storage blocked */ }
    el.sound.textContent = 'Sound: ' + (soundOn ? 'on' : 'off');
    el.sound.setAttribute('aria-pressed', String(soundOn));
    if (soundOn) { ensureAudio(); sfx(660, 0.08, 0.05, 'triangle'); }
  });

  // ---------- the loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    fitCanvas();
    if (bo.state && bo.state.mode === 'play') pump(dt);
    if (bo.state && bo.state.mode === 'hack') paintHack(dt);
    animate(dt);
    render(dt);
    updateHud();
    if (el.follow.hidden === cam.free) el.follow.hidden = !cam.free;
    requestAnimationFrame(frame);
  }
  window.addEventListener('resize', fitCanvas);

  showTitle();
  snapAll();
  requestAnimationFrame(frame);

  // ---------- debug handle ----------
  expose('__blackout', {
    sim: bo, seedDice: bo.seedDice,
    get state() { return bo.state; },
    // the map constants are the current mission's, so read them after newGame(diff, mission)
    get consts() { return { W, H, LV, LADDERS: bo.LADDERS, GUARD_EVERY, GUARD_EVERY_ALARM, ROUNDS, SEEN_GAIN, LIT, TORCH_REACH, CONE_RANGE, START: bo.START, GATE: bo.GATE, CUT: bo.CUT, UPPER: bo.UPPER, LAMPS: bo.LAMPS, CAMERAS: bo.CAMERAS, GUARDS: bo.GUARDS, TERM_ROOM: bo.mission.termRoom }; },
    MISSIONS, get mission() { return bo.missionI; }, pickMission, nextMission, loadSave, showTitle,
    key, kx, ky, kl, tile: ch, passable, los, bfs, neighbours,
    newGame, start, flush, wait, stay, stepDir, arrowTarget, toggleRun, toggleNV,
    moveTo: (x, y, lv) => moveTo(key(x, y, lv === undefined ? bo.state.player.lv : lv)),
    use: useKey, fire, targets, hackPress, contextAction, doAction,
    seesTile, camSees, watchedAt, computeReach, computeVision, computeLight, restoreCheckpoint,
    teleport(x, y, lv) {
      const p = bo.state.player;
      p.x = x; p.y = y; p.lv = lv === undefined ? p.lv : lv;
      p.rx = p.x; p.ry = p.y; p.rl = p.lv;
      pickUp(); advance(); computeVision(); computeReach(); checkWin();
    },
    cam,
  });
