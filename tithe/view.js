/* Tithe: the screen. The town painted in code (houses, the moon, the people), the rooms in
   perspective, the iris of the window shift, the cards, toasts and HUD, the touch pad, the
   journal, keys, sound and pause. See sim.js for the rules.

   Everything is drawn in code: the town, the moon, the people, the rooms. */
import { createTithe } from './sim.js';
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

  const SAVE_KEY = 'tithe-save-v1';

  const ti = createTithe({ load: () => load(), on: onEvent });
  const {
    parseLevel, standable, settle, resolve, reach, toast, freshRun, freshLevel, roomState, checkpoint, startLevel, spawnGuard, syncCell, playerCell, onFloor, moveX, moveY, animate, hangAt, toClimb, jump, leaveInto, tryGrab, land, groundUp, groundDown, updHang, updClimb, updAir, updGround, updPlayer, hurt, die, restore, sees, raiseAlarm, updGuard, takedownTarget, takedown, tryWindow, irisTo, placeSpot, enterRoom, leaveRoom, blocked, stepPlayer, walkTo, usePoint, useSpot, roomUpdate, noise, wake, updPerson, buildPlan, startRoutine, routeTo, sightOf, farEnd, resetRoom, finishMethod, leaveFinale, nearestSpot, doSpot, hideIn, completeSearch, grant, aimTargets, startAim, aimStep, aimFire, pebbleListeners, throwPebble, fireDart, roomTakedownTarget, roomTakedown, lootChoice, afterLoot, statsHtml, fence, consequence, levelIntro, ending, newGame, update, updExt, T, VW, VH, HURT_FALL, DEATH_FALL, SIGHT, MAX_HEARTS, FLOOR, ROOM_SIGHT, DUR, LEVELS, INNOCENT, ITEM_NAMES, at, SOLID, LEDGE, HOLD, isSolid, isLedge, isFloor, grabbable, isHay, ivyAt, ivyOK, decoAt, mv, THEMES, SPOT, HORIZON, EYE, WALL_H, depthK, proj, kAtX, V_MIN, V_MAX, FX, FY, fdist, WIN, DOOR, DOOR_V, CLIMB_IN, PEEK_AT, SILL, S, chaos, has, roomDef, clone, MV, LABEL, TARGET, WHO, ON_WALL, DEPTH, LANE, uOf, halfU, down, ACTS, methodOf, knownM, missingFor, itemName, KIND_WORD, HIDEABLE, PEBBLE_EAR, pebbleLanding, whoList, SHOP, keys, edge,
  } = ti;

  function onEvent(ev, d) {
    switch (ev) {
      case 'save': persist(d); break;
      case 'clear-save': try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* nothing to clear */ } break;
      case 'card': if (d) showCard(d); else hideCard(); break;
      case 'say': sayLine(d[0], d[1]); break;
      case 'sfx': sfx(d); break;
      case 'level': buildArt(d); break;
      case 'cam': clampCam(); break;
      case 'pad': syncPad(); break;
      case 'log': renderLog(); break;
    }
  }
  // ---------- canvas ----------
  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const stage = document.getElementById('stage');
  const $ = (id) => document.getElementById(id);

  function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Smooth value noise on a coarse lattice, for moss and soot.
  function valueNoise(rnd, cell) {
    const cache = new Map();
    const v = (i, j) => { const k = i * 7919 + j; if (!cache.has(k)) cache.set(k, rnd()); return cache.get(k); };
    const sm = (t) => t * t * (3 - 2 * t);
    return (x, y) => {
      const gx = x / cell, gy = y / cell, i = Math.floor(gx), j = Math.floor(gy);
      const fx = sm(gx - i), fy = sm(gy - j);
      const a = v(i, j), b = v(i + 1, j), c = v(i, j + 1), d = v(i + 1, j + 1);
      return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    };
  }

  // '#rrggbb' or 'rgb(r,g,b)' to [r, g, b]
  const hex = (c) => c[0] === '#'
    ? [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]
    : c.slice(c.indexOf('(') + 1, -1).split(',').map(Number);
  const rgb = (r, g, b) => 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  const shade = (c, f) => { const [r, g, b] = hex(c); return rgb(Math.min(255, r * f), Math.min(255, g * f), Math.min(255, b * f)); };

  // ---------- the pixel font ----------
  // 3x5 capitals, each row three bits. Chunky on purpose: it is what the old
  // phones had room for.
  const GLYPHS = {
    A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [3, 4, 4, 4, 3], D: [6, 5, 5, 5, 6], E: [7, 4, 6, 4, 7],
    F: [7, 4, 6, 4, 4], G: [3, 4, 5, 5, 3], H: [5, 5, 7, 5, 5], I: [7, 2, 2, 2, 7], J: [1, 1, 1, 5, 2],
    K: [5, 5, 6, 5, 5], L: [4, 4, 4, 4, 7], M: [5, 7, 7, 5, 5], N: [6, 5, 5, 5, 5], O: [2, 5, 5, 5, 2],
    P: [6, 5, 6, 4, 4], Q: [2, 5, 5, 6, 3], R: [6, 5, 6, 5, 5], S: [3, 4, 2, 1, 6], T: [7, 2, 2, 2, 2],
    U: [5, 5, 5, 5, 7], V: [5, 5, 5, 5, 2], W: [5, 5, 7, 7, 5], X: [5, 5, 2, 5, 5], Y: [5, 5, 2, 2, 2],
    Z: [7, 1, 2, 4, 7], 0: [7, 5, 5, 5, 7], 1: [2, 6, 2, 2, 7], 2: [6, 1, 2, 4, 7], 3: [6, 1, 2, 1, 6],
    4: [5, 5, 7, 1, 1], 5: [7, 4, 6, 1, 6], 6: [3, 4, 6, 5, 2], 7: [7, 1, 2, 2, 2], 8: [2, 5, 2, 5, 2],
    9: [2, 5, 3, 1, 6], '.': [0, 0, 0, 0, 2], ',': [0, 0, 0, 2, 4], '!': [2, 2, 2, 0, 2], '?': [7, 1, 2, 0, 2],
    ':': [0, 2, 0, 2, 0], "'": [2, 2, 0, 0, 0], '-': [0, 0, 7, 0, 0], '+': [0, 2, 7, 2, 0], '/': [1, 1, 2, 4, 4],
    '(': [1, 2, 2, 2, 1], ')': [4, 2, 2, 2, 4], '"': [5, 5, 0, 0, 0], '>': [4, 2, 1, 2, 4], '<': [1, 2, 4, 2, 1],
  };
  function textWidth(s, sc) { return s.length * 4 * sc - sc; }
  function drawText(c, s, x, y, color, sc, align, shadowCol) {
    sc = sc || 1;
    s = String(s).toUpperCase();
    let x0 = Math.round(align === 'center' ? x - textWidth(s, sc) / 2 : align === 'right' ? x - textWidth(s, sc) : x);
    y = Math.round(y);
    const pass = (col, ox, oy) => {
      c.fillStyle = col;
      for (let i = 0; i < s.length; i++) {
        const g = GLYPHS[s[i]];
        if (!g) continue;
        for (let r = 0; r < 5; r++) for (let b = 0; b < 3; b++) {
          if (g[r] & (4 >> b)) c.fillRect(x0 + i * 4 * sc + b * sc + ox, y + r * sc + oy, sc, sc);
        }
      }
    };
    if (shadowCol !== null) pass(shadowCol || '#0d0b09', sc, sc);
    pass(color, 0, 0);
  }

  // ---------- people ----------
  // Everybody is the same little rig: a handful of joints per pose, limbs drawn
  // as thick pixel lines, an outline pass under a fill pass, and a head drawn
  // pixel by pixel. Coordinates are game pixels at scale 1, feet at (0, 0).
  const LOOKS = {
    // Wren, after Amber's picture of her: auburn hair worn loose to the shoulder, a worn brown leather
    // jacket over dark sleeves, a strap across to a satchel, khaki trousers in tall boots
    wren: { head: 'loose', hair: '#94421f', hairL: '#bf6232', hairD: '#5e2914', skin: '#dcaa8c', skinD: '#a8735a', torso: '#4c3324', torsoL: '#76533a', collar: '#26262c', arm: '#4c3324', bracer: '#6a4a34', under: '#363c4a', leg: '#7a5e3c', shin: '#5e3c24', boot: '#47291a', belt: '#22160f', buckle: '#a8a8a0', strap: '#2e1e14', satchel: '#5e4430', satchelL: '#7a5a40', tube: '#3a3434', tubeCap: '#8a8c94', vials: ['#4a9a5a', '#a03a3a'], blade: '#b9cad6', out: '#15110e' },
    // the Watch, after Amber's barracks picture: a steel kettle hat over cropped hair, mail
    // sleeves, a tabard in their house's colour belted over the mail, a cloth mantle on
    // the shoulders, brown hose in grey boots
    guard: { head: 'kettle', helm: '#9298a2', helmD: '#5a5e66', helmL: '#c8ccd4', hair: '#5a3a24', skin: '#c39478', skinD: '#88604e', torso: '#6a2a26', torsoL: '#8a3c34', skirt: true, mantle: '#6e6640', mantleD: '#48422a', arm: '#858a94', bracer: '#747882', mail: '#4a4e56', leg: '#5a4632', shin: '#3c3c44', boot: '#2c2c32', cuff: '#5c5c64', belt: '#3e2818', buckle: '#b0a070', out: '#141210' },
    clerk: { head: 'hair', hair: '#4a3a2c', skin: '#d0a488', skinD: '#906650', torso: '#2d2c33', torsoL: '#44424c', arm: '#2d2c33', bracer: '#e2dccd', leg: '#26252a', boot: '#1d1a18', belt: '#1d1a18', collar: '#e2dccd', out: '#121014' },
    cook: { head: 'cap', cap: '#e4ddcc', skin: '#d8a88a', skinD: '#9a6a52', torso: '#6a5a46', torsoL: '#857259', arm: '#7a6a55', bracer: '#d8a88a', leg: '#4a3e32', boot: '#2c231c', belt: '#e4ddcc', apron: '#ddd4c0', out: '#15110e' },
    servant: { head: 'cap', cap: '#d6cfbf', skin: '#c89a7c', skinD: '#8e6450', torso: '#4f4260', torsoL: '#66577a', arm: '#4f4260', bracer: '#c89a7c', leg: '#3e3450', boot: '#231d1a', belt: '#d6cfbf', apron: '#d6cfbf', robe: '#4f4260', out: '#141018' },
    sexton: { head: 'cowl', hood: '#4d3c2e', hoodD: '#35291f', hoodL: '#65503d', skin: '#caa088', skinD: '#8e6450', torso: '#4d3c2e', torsoL: '#65503d', arm: '#4d3c2e', bracer: '#caa088', leg: '#3a2d22', boot: '#231a14', belt: '#c2b08a', robe: '#4d3c2e', out: '#141010' },
    abbot: { head: 'mitre', mitre: '#e7e0cf', mitreD: '#b9ae98', gold: '#c9a13e', skin: '#d6a78e', skinD: '#9a6a56', torso: '#6b2f2f', torsoL: '#8a4040', arm: '#6b2f2f', bracer: '#e7e0cf', leg: '#3a2020', boot: '#231414', belt: '#c9a13e', robe: '#e2dac8', robeD: '#b5ab96', out: '#161010' },
    magistrate: { head: 'wig', wig: '#e9e4d8', wigD: '#b8b2a4', skin: '#d4a08a', skinD: '#966450', torso: '#7a1f1f', torsoL: '#9a3030', arm: '#7a1f1f', bracer: '#e9e4d8', leg: '#2a1a1a', boot: '#1d1414', belt: '#1d1414', robe: '#6a1a1a', robeD: '#4a1212', collar: '#e9e4d8', out: '#140c0c' },
    countess: { head: 'bun', hair: '#2a1d18', gold: '#d4ad4a', skin: '#e0b8a0', skinD: '#a07a64', torso: '#244032', torsoL: '#355a46', arm: '#244032', bracer: '#e0b8a0', leg: '#1a2a22', boot: '#141c18', belt: '#d4ad4a', robe: '#1f3a2c', robeD: '#15281e', out: '#0e1410' },
  };

  const P0 = {
    stand: { h: [0, -24], n: [0, -20], hip: [0, -11], kf: [1.5, -6], ff: [2, 0], kb: [-1.5, -6], fb: [-2, 0], ef: [3, -15], hf: [3.5, -11], eb: [-3, -15], hb: [-3.5, -11] },
    jump: { h: [1, -26], n: [1, -22], hip: [0, -14], kf: [4, -11], ff: [2, -6], kb: [-2, -9], fb: [-5, -6], ef: [4, -21], hf: [6, -25], eb: [-3, -18], hb: [-5, -15] },
    hang: { h: [0, -26], n: [0, -22], hip: [0, -13], kf: [1, -7], ff: [1, -1], kb: [-1, -7], fb: [-1, -1], ef: [3, -28], hf: [2, -32], eb: [-3, -28], hb: [-2, -32] },
    fall: { h: [0, -24], n: [0, -20], hip: [0, -11], kf: [2, -6], ff: [3, -1], kb: [-2, -6], fb: [-3, -2], ef: [5, -22], hf: [6, -27], eb: [-5, -22], hb: [-6, -27] },
    crouch: { h: [3, -17], n: [2, -14], hip: [-1, -8], kf: [3, -6], ff: [3, 0], kb: [-3, -3], fb: [-4, 0], ef: [5, -11], hf: [8, -12], eb: [0, -10], hb: [3, -11] },
    throw: { h: [0, -24], n: [0, -20], hip: [0, -11], kf: [2, -6], ff: [4, 0], kb: [-2, -6], fb: [-3, 0], ef: [3, -21], hf: [7, -25], eb: [-3, -16], hb: [-5, -13] },
    reach: { h: [2, -23], n: [1, -19], hip: [-1, -11], kf: [2, -6], ff: [3, 0], kb: [-2, -6], fb: [-3, 0], ef: [5, -17], hf: [9, -16], eb: [-2, -15], hb: [-3, -11] },
    peek: { h: [0, -26], n: [0, -22], hip: [0, -13], kf: [1, -7], ff: [1, -1], kb: [-1, -7], fb: [-1, -1], ef: [5, -20], hf: [4, -24], eb: [-5, -20], hb: [-4, -24] },
    lie: { h: [-11, -3], n: [-8, -3], hip: [2, -3], kf: [7, -3], ff: [12, -1], kb: [7, -2], fb: [12, -1], ef: [-4, -1], hf: [0, -1], eb: [-5, -4], hb: [-1, -5] },
    point: { h: [0, -24], n: [0, -20], hip: [0, -11], kf: [1.5, -6], ff: [2, 0], kb: [-1.5, -6], fb: [-2, 0], ef: [5, -18], hf: [9, -19], eb: [-3, -15], hb: [-3, -11] },
  };
  function walkPose(ph, stride) {
    const s = Math.sin(ph * Math.PI * 2) * stride, c = Math.cos(ph * Math.PI * 2);
    const lift = (v) => Math.min(0, v) * 1.6;
    return {
      h: [0.5, -24 + Math.abs(c) * 0.5], n: [0.5, -20 + Math.abs(c) * 0.5], hip: [0, -11 + Math.abs(c) * 0.4],
      kf: [s * 0.6 + 1, -6], ff: [s, lift(-c)], kb: [-s * 0.6 + 1, -6], fb: [-s, lift(c)],
      ef: [-s * 0.4 + 1.5, -15], hf: [-s * 0.7 + 2, -11], eb: [s * 0.4 - 1.5, -15], hb: [s * 0.7 - 2, -11],
    };
  }
  // Walking straight into the room or out toward the camera: seen from behind or in
  // front, the feet lift in turn and the arms swing a little.
  function walkDepthPose(ph) {
    const s = Math.sin(ph * Math.PI * 2), lr = Math.max(0, s) * 2, ll = Math.max(0, -s) * 2;
    return {
      h: [0, -24 - Math.abs(s) * 0.3], n: [0, -20], hip: [0, -11],
      kf: [1.8, -6 - lr], ff: [2, -lr], kb: [-1.8, -6 - ll], fb: [-2, -ll],
      ef: [3.2, -15], hf: [3.5, -11 + s * 1.5], eb: [-3.2, -15], hb: [-3.5, -11 - s * 1.5],
    };
  }

  function climbPose(ph) {
    const s = Math.sin(ph * Math.PI * 2);
    return {
      h: [0, -25], n: [0, -21], hip: [0, -12], kf: [2, -7 - s * 2], ff: [2, -1 - s * 3], kb: [-2, -7 + s * 2], fb: [-2, -1 + s * 3],
      ef: [3, -25 + s * 2], hf: [2.5, -30 + s * 3], eb: [-3, -25 - s * 2], hb: [-2.5, -30 - s * 3],
    };
  }

  // Draws a figure. ox/oy: feet, in screen pixels. s: scale. f: facing (+1 right).
  // back: seen from behind (hanging, climbing).
  function drawFigure(c, look, pose, ox, oy, s, f, opts) {
    const o = opts || {};
    const L = LOOKS[look] || LOOKS.guard;
    ox = Math.round(ox); oy = Math.round(oy);
    const X = (v) => ox + Math.round(v * f * s);
    const Y = (v) => oy + Math.round(v * s);
    const dot = (x, y, th, col) => {
      c.fillStyle = col;
      const t = Math.max(1, Math.round(th * s)), h = Math.floor(t / 2);
      c.fillRect(x - h, y - h, t, t);
    };
    const line = (a, b, th, col) => {
      const x0 = X(a[0]), y0 = Y(a[1]), x1 = X(b[0]), y1 = Y(b[1]);
      const n = Math.max(1, Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
      for (let i = 0; i <= n; i++) dot(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), th, col);
    };
    const R = (x, y, w, h, col) => { // a rect in rig units, mirrored with the facing
      c.fillStyle = col;
      const x0 = f > 0 ? x : -(x + w);
      c.fillRect(ox + Math.round(x0 * s), oy + Math.round(y * s), Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)));
    };
    const p = pose;
    const robe = L.robe && !o.lying;
    const segs = [
      [p.hip, p.kb, 3, L.leg], [p.kb, p.fb, 3, L.shin || L.leg], [p.fb, [p.fb[0] + 1.5, p.fb[1]], 3, L.boot],
      [p.n, p.eb, 2.2, L.arm], [p.eb, p.hb, 2.2, L.bracer],
      [p.n, p.hip, 5, L.torso],
      [p.hip, p.kf, 3, L.leg], [p.kf, p.ff, 3, L.shin || L.leg], [p.ff, [p.ff[0] + 1.5, p.ff[1]], 3, L.boot],
      [p.n, p.ef, 2.2, L.arm], [p.ef, p.hf, 2.2, L.bracer],
    ];
    // outline pass, then fill
    for (const sg of segs) line(sg[0], sg[1], sg[2] + 2 / s, L.out);
    if (L.mantle && !o.lying) R(p.n[0] - 4, p.n[1] - 2, 8, 5, L.out);
    if (robe) drawRobe(true);
    head(true);
    if (L.tube && !o.lying && !o.front) {
      // the scroll case slung across her back, its cap just over her shoulder
      const a = [p.n[0] - 2.5, p.n[1] + 6], b = [p.n[0] - 4, p.n[1] - 2];
      line(a, b, 2 + 2 / s, L.out);
      line(a, b, 2, L.tube);
      dot(X(b[0]), Y(b[1]), 2, L.tubeCap);
    }
    for (let i = 0; i < segs.length; i++) {
      const sg = segs[i];
      if (o.back && i >= 6) { line(sg[0], sg[1], sg[2], sg[3]); continue; }
      line(sg[0], sg[1], sg[2], i < 5 ? shade(sg[3], 0.8) : sg[3]);
      if (L.mail && (i === 3 || i === 4 || i === 9 || i === 10)) mailOn(sg[0], sg[1], i < 5);
      if (L.cuff && (i === 1 || i === 7)) dot(X(sg[0][0]), Y(sg[0][1] + 0.5), 3, i < 5 ? shade(L.cuff, 0.8) : L.cuff);
      if (i === 8 && L.skirt && !o.lying) {
        // the tabard hangs below the belt, over the thighs
        R(p.hip[0] - 2.5, p.hip[1], 5, 4, L.torso);
        R(p.hip[0] - 2.5, p.hip[1] + 3, 5, 1, shade(L.torso, 0.75));
        R(p.hip[0] + 1.5, p.hip[1], 1, 4, L.torsoL);
      }
      if (i === 5) {
        if (robe) drawRobe(false);
        // torso light down the lit side, a belt, a buckle
        line([p.n[0] + 1, p.n[1] + 1], [p.hip[0] + 1, p.hip[1] - 1], 1.2, L.torsoL);
        line([p.hip[0] - 2.5, p.hip[1]], [p.hip[0] + 2.5, p.hip[1]], 1.2, L.belt);
        if (L.buckle && !o.back) dot(X(p.hip[0] + 1), Y(p.hip[1]), 1, L.buckle);
        if (L.apron && !o.back) line([p.hip[0] + 1.5, p.hip[1]], [p.hip[0] + 2, p.hip[1] + 7], 3, L.apron);
        if (L.collar) line([p.n[0] - 1, p.n[1]], [p.n[0] + 1.5, p.n[1]], 1.4, L.collar);
        if (L.satchel) {
          // the satchel rides on her back hip; its strap crosses her chest
          R(p.hip[0] - 5, p.hip[1] - 1, 3, 5, L.out);
          R(p.hip[0] - 4.5, p.hip[1] - 0.5, 2.5, 4, L.satchel);
          R(p.hip[0] - 4.5, p.hip[1] - 0.5, 2.5, 1, L.satchelL);
          if (!o.back) {
            line([p.n[0] + 1.5, p.n[1] + 0.5], [p.hip[0] - 2, p.hip[1] - 0.5], 1, L.strap);
            dot(X(p.hip[0] + 2), Y(p.hip[1] + 1), 1, L.vials[0]);
            dot(X(p.hip[0] + 2.8), Y(p.hip[1] + 1), 1, L.vials[1]);
          }
        }
      }
    }
    if (L.mantle && !o.lying) {
      // the cloth mantle over his shoulders
      R(p.n[0] - 3.5, p.n[1] - 1.5, 7, 3, L.mantle);
      R(p.n[0] - 3.5, p.n[1] + 1.5, 7, 1, L.mantleD);
      R(p.n[0] - 3, p.n[1] - 1, 2, 1, shade(L.mantle, 1.25));
    }
    if (L.under && !o.lying) {
      // the dark undersleeve showing at the elbow, between jacket and leather cuff
      dot(X(p.ef[0]), Y(p.ef[1]), 2, L.under);
    }
    if (look === 'wren' && !o.back && !o.lying && o.blades) {
      // the two knives, held low
      line(p.hf, [p.hf[0] + 1.5, p.hf[1] + 4], 1, L.blade);
      line(p.hb, [p.hb[0] - 1, p.hb[1] + 4], 1, shade(L.blade, 0.75));
    }
    head(false);

    function mailOn(a, b, back) {
      // ring mail: a dark stipple down the sleeve
      const x0 = X(a[0]), y0 = Y(a[1]), x1 = X(b[0]), y1 = Y(b[1]);
      const n = Math.max(1, Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
      c.fillStyle = back ? shade(L.mail, 0.8) : L.mail;
      for (let k = 0; k <= n; k += 2) c.fillRect(Math.round(x0 + (x1 - x0) * k / n) - (k % 4 ? 1 : 0), Math.round(y0 + (y1 - y0) * k / n), Math.max(1, Math.round(s)), Math.max(1, Math.round(s)));
    }
    function drawRobe(outline) {
      const hy = p.hip[1], hx = p.hip[0];
      const fy = Math.max(p.ff[1], p.fb[1]);
      const bot = Math.min(-0.5, fy + 0.5);
      for (let yy = hy; yy <= bot; yy += 1 / s) {
        const t = (yy - hy) / Math.max(1, bot - hy);
        const half = 2.6 + t * 2.2 + (outline ? 1 / s : 0);
        const col = outline ? L.out : (t > 0.85 ? (L.robeD || shade(L.robe, 0.7)) : L.robe);
        c.fillStyle = col;
        const xa = X(hx - half), xb = X(hx + half);
        c.fillRect(Math.min(xa, xb), Y(yy), Math.abs(xb - xa) + 1, Math.max(1, Math.round(s / 1)));
      }
    }
    function head(outline) {
      const hx = p.h[0], hy = p.h[1];
      if (outline) {
        R(hx - 4, hy - 5, 8, 9, L.out);
        if (L.head === 'mitre') R(hx - 3, hy - 11, 6, 7, L.out);
        if (L.head === 'bun') R(hx - 5, hy - 5, 4, 5, L.out);
        if (L.head === 'loose') { if (o.front) R(hx - 5, hy - 3, 10, 9, L.out); else R(hx - 5, hy - 4, 4, 10, L.out); }
        if (L.head === 'kettle') { R(hx - 3, hy - 6, 6, 2, L.out); R(hx - 5, hy - 4, 10, 3, L.out); }
        return;
      }
      const skinBlock = () => {
        if (o.back) return;
        R(hx - 1, hy - 1, 4, 4, L.skin);
        R(hx + 2, hy - 1, 1, 4, L.skinD);
        R(hx + 1, hy, 1, 1, '#1d1512');
      };
      if (o.back && L.head !== 'hood' && L.head !== 'cowl') {
        const col = L.helm || L.hair || L.cap || L.wig || L.mitre || L.skinD;
        R(hx - 3, hy - 4, 6, 8, col);
        R(hx - 3, hy - 4, 2, 1, shade(col, 1.2));
        if (L.head === 'kettle') {
          R(hx - 3, hy - 1, 6, 4, L.hair);
          R(hx - 2, hy - 5, 4, 1, L.helm); R(hx - 3, hy - 4, 6, 2, L.helm); R(hx - 2, hy - 5, 2, 1, L.helmL);
          R(hx - 4, hy - 2, 8, 1, L.helmD);
        }
        if (L.head === 'loose') {
          // from behind: her hair down past her collar
          R(hx - 3, hy - 4, 6, 10, L.hair); R(hx - 4, hy + 1, 8, 4, L.hair);
          R(hx - 2, hy - 4, 2, 1, L.hairL); R(hx - 1, hy, 1, 5, L.hairD); R(hx + 2, hy + 2, 1, 3, L.hairD);
        }
        if (L.head === 'cap' || L.head === 'helm') R(hx - 3, hy + 1, 6, 3, L.skinD);
        return;
      }
      switch (L.head) {
        case 'loose':
          if (o.front) {
            // face on, in the rooms: parted over the brow, falling either side to the shoulders
            R(hx - 3, hy - 3, 6, 7, L.skin);
            R(hx - 2, hy, 1, 1, '#2a1a12'); R(hx + 1, hy, 1, 1, '#2a1a12');
            R(hx - 1, hy + 2, 2, 1, L.skinD);
            R(hx - 3, hy - 4, 6, 2, L.hair); R(hx - 1, hy - 4, 2, 1, L.hairL);
            R(hx - 4, hy - 3, 2, 8, L.hair); R(hx + 2, hy - 3, 2, 8, L.hair);
            R(hx - 4, hy + 2, 1, 3, L.hairD); R(hx + 3, hy + 2, 1, 3, L.hairD);
          } else {
            R(hx - 3, hy - 3, 6, 7, L.skin); skinBlock();
            R(hx - 3, hy - 4, 6, 2, L.hair); R(hx - 1, hy - 4, 3, 1, L.hairL);
            R(hx + 2, hy - 3, 1, 2, L.hairD);    // a loose strand over the brow
            // falling behind her ear and down to her shoulder
            R(hx - 4, hy - 3, 3, 9, L.hair); R(hx - 1, hy - 2, 1, 4, L.hair);
            R(hx - 4, hy + 1, 1, 5, L.hairD); R(hx - 2, hy + 3, 1, 3, L.hairD);
          }
          break;
        case 'kettle':
          // a steel kettle hat: a round crown and a wide brim, cropped hair under it
          R(hx - 3, hy - 3, 6, 7, L.skin); skinBlock();
          R(hx - 3, hy - 1, 2, 4, L.hair); R(hx - 3, hy + 3, 3, 1, L.hair);
          R(hx - 2, hy - 5, 4, 1, L.helm); R(hx - 3, hy - 4, 6, 2, L.helm);
          R(hx - 2, hy - 5, 2, 1, L.helmL); R(hx - 3, hy - 4, 1, 1, L.helmL); R(hx + 2, hy - 4, 1, 2, L.helmD);
          R(hx - 4, hy - 2, 8, 1, L.helmL); R(hx - 4, hy - 1, 1, 1, L.helmD); R(hx + 3, hy - 1, 1, 1, L.helmD);
          break;
        case 'hood': case 'cowl':
          R(hx - 3, hy - 4, 6, 8, L.hood);
          R(hx - 3, hy - 4, 2, 1, L.hoodL); R(hx - 3, hy - 3, 1, 3, L.hoodL);
          if (o.front) {
            // face on: the opening in the middle of the hood
            R(hx - 2, hy - 2, 4, 5, L.hoodD);
            R(hx - 1, hy - 1, 3, 3, L.skin); R(hx - 1, hy - 1, 3, 1, L.skinD);
            R(hx - 1, hy, 1, 1, '#1d1512'); R(hx + 1, hy, 1, 1, '#1d1512');
          } else if (!o.back) {
            R(hx, hy - 2, 3, 5, L.hoodD);
            R(hx + 1, hy - 1, 2, 3, L.skin); R(hx + 1, hy - 1, 2, 1, L.skinD);
            R(hx + 2, hy, 1, 1, '#1d1512');
          } else R(hx - 1, hy - 3, 1, 6, L.hoodD);
          R(hx - 2, hy + 3, 5, 1, L.hoodD);
          break;
        case 'helm':
          R(hx - 3, hy - 1, 6, 5, L.skin); skinBlock();
          R(hx - 3, hy - 4, 6, 3, L.helm); R(hx - 3, hy - 4, 2, 1, shade(L.helm, 1.25));
          R(hx - 4, hy - 1, 8, 1, L.helmD);
          if (!o.back) R(hx + 1, hy - 1, 1, 3, L.helmD);
          break;
        case 'hair':
          R(hx - 3, hy - 3, 6, 7, L.skin); skinBlock();
          R(hx - 3, hy - 4, 6, 2, L.hair); R(hx - 3, hy - 2, 2, 4, L.hair);
          break;
        case 'cap':
          R(hx - 3, hy - 3, 6, 7, L.skin); skinBlock();
          R(hx - 3, hy - 4, 6, 3, L.cap); R(hx - 4, hy - 2, 2, 2, L.cap);
          break;
        case 'mitre':
          R(hx - 3, hy - 3, 6, 7, L.skin); skinBlock();
          R(hx - 3, hy - 3, 2, 3, '#cfc6b4');
          R(hx - 2, hy - 10, 4, 7, L.mitre); R(hx - 3, hy - 6, 6, 3, L.mitre);
          R(hx - 1, hy - 10, 1, 7, L.gold); R(hx - 3, hy - 4, 6, 1, L.gold);
          break;
        case 'wig':
          R(hx - 3, hy - 3, 6, 7, L.skin); skinBlock();
          R(hx - 4, hy - 4, 7, 2, L.wig); R(hx - 4, hy - 2, 3, 6, L.wig); R(hx - 4, hy + 1, 3, 1, L.wigD); R(hx - 4, hy + 3, 3, 1, L.wigD);
          break;
        case 'bun':
          R(hx - 3, hy - 3, 6, 7, L.skin); skinBlock();
          R(hx - 3, hy - 4, 6, 2, L.hair); R(hx - 3, hy - 2, 2, 3, L.hair); R(hx - 5, hy - 4, 3, 3, L.hair);
          R(hx - 2, hy - 5, 4, 1, L.gold);
          break;
      }
    }
  }

  function poseFor(name, ph) {
    if (name === 'walk') return walkPose(ph, 3.2);
    if (name === 'sprint') {
      // a longer stride, leaning into it, arms pumping
      const p = walkPose(ph, 4.8);
      p.h[0] += 2; p.n[0] += 1.5; p.hip[0] -= 0.5;
      p.ef[1] -= 1; p.hf[0] += (p.hf[0] - 2) * 0.6; p.hf[1] -= 2; p.hb[0] += (p.hb[0] + 2) * 0.6; p.hb[1] -= 2;
      return p;
    }
    if (name === 'climb') return climbPose(ph);
    if (name === 'idle') {
      const b = Math.sin(ph * Math.PI * 2) * 0.35;
      const p = JSON.parse(JSON.stringify(P0.stand));
      p.h[1] += b; p.n[1] += b;
      return p;
    }
    return P0[name] || P0.stand;
  }

  // ---------- the town ----------
  // Built once per level. Back to front: the sky; a far skyline and a back row of
  // houses, which scroll slower than she does so the street has depth; then the
  // street she climbs, painted into two canvases the size of the level — `bg` the
  // house fronts, roofs and windows, `fg` everything she can stand on or hold.
  // Every hold gets the same pale, moonlit top edge, so the eye learns to read it.
  const art = {};
  const PAD_TOP = 8 * T, PAD_BOT = T;   // night sky above the highest roof; a strip of street below
  const FAR_K = 0.2, NEAR_K = 0.5;      // how fast the skyline and the back row scroll
  const NIGHT = {
    plaster: ['#7b735f', '#736754', '#6a6458', '#7e735b', '#6e6956', '#665d4c'],
    timber: '#2b1e16', timberL: '#4f3828', timberD: '#17100b',
    roof: ['#5b362b', '#603d2e', '#4e362e', '#5d3228'],
    hold: '#ddd3b6',
    wood: '#5e4331', woodL: '#806046', woodD: '#33241a',
    lead: '#3a2414',
  };
  const houseAt = (L, x) => L.houses.find((h) => x >= h[0] && x < h[0] + h[1]);

  function thick(b, xa, ya, xb, yb, col, th) {
    const n = Math.max(1, Math.max(Math.abs(xb - xa), Math.abs(yb - ya)));
    b.fillStyle = col;
    for (let i = 0; i <= n; i++) b.fillRect(Math.round(xa + (xb - xa) * i / n) - (th >> 1), Math.round(ya + (yb - ya) * i / n) - (th >> 1), th, th);
  }

  // Coursed stone, per pixel: blocks of random length in 8px courses, dark mortar,
  // a mottle, soot, and moss on the tops of blocks where the moss noise runs high.
  function masonry(b, X, Y, Wd, Hd, stone, moss, seed, light) {
    if (Wd <= 0 || Hd <= 0) return;
    const rnd = rng(seed), mz = valueNoise(rnd, 22), grain = valueNoise(rnd, 5), soot = valueNoise(rnd, 50);
    const img = b.getImageData(X, Y, Wd, Hd), d = img.data;
    for (let cy = 0; cy < Hd; cy += 8) {
      let x = -Math.floor(rnd() * 18);
      while (x < Wd) {
        const bw = 9 + Math.floor(rnd() * 14), lum = 0.8 + rnd() * 0.32, warm = (rnd() - 0.5) * 10;
        for (let py = 0; py < 8 && cy + py < Hd; py++) for (let px = 0; px < bw; px++) {
          const lx = x + px, ly = cy + py;
          if (lx < 0 || lx >= Wd) continue;
          const gx = X + lx, gy = Y + ly;
          let r, g, bl;
          if (py === 7 || px === bw - 1) {
            const f = 0.3 + grain(gx, gy) * 0.08;
            r = stone[0] * f; g = stone[1] * f; bl = stone[2] * f;
          } else {
            const f = lum * (py === 0 ? 1.14 : py === 6 ? 0.82 : 1) * (px === 0 ? 1.06 : 1) * (0.93 + grain(gx, gy) * 0.14);
            r = stone[0] * f + warm; g = stone[1] * f + warm * 0.6; bl = stone[2] * f;
            const m = mz(gx, gy);
            if (m > 1 - moss * 0.55 && py < 3 + (m > 0.9 ? 3 : 0) && rnd() < 0.55 + (m - 0.6)) {
              const k = rnd();
              if (k < 0.4) { r = 66; g = 82; bl = 42; } else if (k < 0.8) { r = 82; g = 100; bl = 50; } else { r = 104; g = 122; bl = 60; }
            }
          }
          const sh = (light ? light(gx, gy) : 1) * (0.85 + 0.25 * soot(gx, gy));
          const i = (ly * Wd + lx) * 4;
          d[i] = Math.min(255, r * sh); d[i + 1] = Math.min(255, g * sh); d[i + 2] = Math.min(255, bl * sh); d[i + 3] = 255;
        }
        x += bw;
      }
    }
    b.putImageData(img, X, Y);
  }

  // Leaded diamond panes, lit or dark, in a timber frame: (x, y) its top left.
  function leaded(b, x, y, wd, ht, lit, seed) {
    const r = rng(seed);
    b.fillStyle = NIGHT.timberD; b.fillRect(x - 2, y - 2, wd + 4, ht + 3);
    for (let py = 0; py < ht; py++) for (let px = 0; px < wd; px++) {
      const t = py / ht;
      const lead = (px + py) % 4 === 0 || (px - py + 400) % 4 === 0;
      if (lit) b.fillStyle = lead ? NIGHT.lead : rgb(255 - t * 50, 214 - t * 90, 128 - t * 90);
      else b.fillStyle = lead ? '#141822' : rgb(36 + (1 - t) * 14, 44 + (1 - t) * 14, 64 + (1 - t) * 18);
      b.fillRect(x + px, y + py, 1, 1);
    }
    if (!lit) { b.fillStyle = 'rgba(190,205,235,0.22)'; b.fillRect(x + 1, y + 1, 2, Math.min(6, ht - 2)); }
    else if (r() < 0.5) { b.fillStyle = 'rgba(60,30,14,0.55)'; b.fillRect(x + 1 + Math.floor(r() * (wd - 4)), y + ht - 9, 3, 9); } // someone's shape behind the glass
    b.fillStyle = NIGHT.timber;
    b.fillRect(x + (wd >> 1), y, 1, ht);                           // the mullion
    b.fillRect(x, y + Math.round(ht * 0.36), wd, 1);                  // the transom
  }

  // A timbered house: plaster, its timber frame, a stone ground floor (most of
  // them), windows on every storey, a door and a shop front at the bottom.
  function paintHouse(b, w, L, h, lights) {
    const [x0, cw, eave] = h, F = w.H - 2;
    const X0 = x0 * T, Wd = cw * T, top = eave * T, bot = (w.H - 1) * T, gTop = (F - 2) * T;
    const hr = rng(x0 * 131 + L.art.seed);
    const plaster = hex(NIGHT.plaster[Math.floor(hr() * NIGHT.plaster.length)]);
    const stoneBase = hr() < 0.7;
    const mott = valueNoise(hr, 7), damp = valueNoise(hr, 26);
    const img = b.createImageData(Wd, bot - top), d = img.data;
    for (let y = 0; y < bot - top; y++) for (let x = 0; x < Wd; x++) {
      const gx = X0 + x, gy = top + y;
      let f = 0.88 + mott(gx, gy) * 0.18 - (hr() < 0.07 ? 0.05 : 0);
      const dm = damp(gx, gy);
      if (dm > 0.6) f *= 1 - (dm - 0.6) * 0.8;
      f *= 1.05 - 0.14 * (y / (bot - top));
      const i = (y * Wd + x) * 4;
      d[i] = plaster[0] * f; d[i + 1] = plaster[1] * f; d[i + 2] = plaster[2] * f; d[i + 3] = 255;
    }
    b.putImageData(img, X0, top);
    if (stoneBase) masonry(b, X0, gTop, Wd, bot - gTop, [96, 94, 90], L.art.moss * 0.6, x0 * 17 + 3);

    // the frame: corner posts, a stud at every other cell line, a beam at each storey
    const upBot = stoneBase ? gTop : bot;
    const mapAt = (x, y) => (L.map[y] && L.map[y][x]) || ' ';
    for (let cx = x0; cx <= x0 + cw; cx++) {
      const edge = cx === x0 || cx === x0 + cw;
      if (!edge && (cx - x0) % 2) continue;
      const px = cx === x0 ? cx * T : cx === x0 + cw ? cx * T - 3 : cx * T - 1;
      b.fillStyle = NIGHT.timber; b.fillRect(px, top, 3, upBot - top);
      b.fillStyle = NIGHT.timberL; b.fillRect(px, top, 1, upBot - top);
    }
    // braces in the panels that have no window in them, leaning out from the middle
    const mid = x0 + cw / 2;
    for (let a = F - 5; a + 2 > eave; a -= 3) {
      const y0 = Math.max(top + 4, a * T + 2), y1 = (a + 3) * T - 2;
      if (y1 - y0 < 16) continue;
      for (let cx = x0; cx + 1 < x0 + cw; cx += 2) {
        let busy = false;
        for (let yy = a; yy <= a + 2; yy++) for (const xx of [cx, cx + 1]) if (mapAt(xx, yy) !== '.') busy = true;
        if (busy) continue;
        const xa = cx * T + 2, xb = (cx + 2) * T - 2;
        const kind = hr();
        if (kind < 0.35) { thick(b, xa, y1, xb, y0, NIGHT.timber, 2); thick(b, xa, y0, xb, y1, NIGHT.timber, 2); }
        else if (cx + 1 < mid) thick(b, xa, y1, xb, y0, NIGHT.timber, 3);
        else thick(b, xa, y0, xb, y1, NIGHT.timber, 3);
      }
    }
    for (let a = F - 2; a * T > top; a -= 3) {
      const y = a * T;
      b.fillStyle = NIGHT.timber; b.fillRect(X0, y - 1, Wd, 4);
      b.fillStyle = NIGHT.timberL; b.fillRect(X0, y - 1, Wd, 1);
      b.fillStyle = 'rgba(0,0,0,0.3)'; b.fillRect(X0, y + 3, Wd, 2);
    }
    b.fillStyle = NIGHT.timber; b.fillRect(X0, top + 4, Wd, 3);

    // windows: a sill holds the glass above it, up to the storey beam
    for (let y = eave; y <= F; y++) for (let x = x0; x < x0 + cw; x++) {
      const ch = mapAt(x, y), X = x * T;
      if (ch === '-') {
        const lit = hr() < 0.62;
        leaded(b, X + 2, (y - 2) * T + 4, 12, 2 * T - 5, lit, x * 31 + y);
        if (lit) lights.push([X + 8, (y - 1) * T, 1]);
      } else if (ch === 'w') {
        // a window with its shutters closed: two painted leaves meeting in the middle, a
        // diamond cut in each with the lamplight behind it, and a sill like any other
        // window's (but no hold: it has none in the map)
        const sy = (y - 1) * T + 4, sh = 2 * T - 5;
        const paint = ['#3e4a3a', '#3a4252', '#523a32', '#4a4234'][(x * 7 + y * 3) % 4];
        b.fillStyle = NIGHT.timberD; b.fillRect(X + 1, sy - 2, 14, sh + 3);
        for (const lx of [X + 2, X + 8]) {
          b.fillStyle = paint; b.fillRect(lx, sy, 6, sh);
          b.fillStyle = shade(paint, 1.3); b.fillRect(lx, sy, 6, 1); b.fillRect(lx, sy, 1, sh);
          b.fillStyle = shade(paint, 0.7); b.fillRect(lx + 1, sy + 3, 4, 1); b.fillRect(lx + 1, sy + sh - 4, 4, 1);
          b.fillStyle = 'rgba(255,190,110,0.75)';
          b.fillRect(lx + 2, sy + 8, 2, 1); b.fillRect(lx + 1, sy + 9, 4, 1); b.fillRect(lx + 2, sy + 10, 2, 1);
        }
        b.fillStyle = NIGHT.timberD; b.fillRect(X + 7, sy, 1, sh);
        b.fillStyle = shade(rgb(150, 142, 124), 0.85); b.fillRect(X, sy + sh, 16, 2);
        b.fillStyle = 'rgba(0,0,0,0.35)'; b.fillRect(X, sy + sh + 2, 16, 2);
      } else if ('123456789'.includes(ch)) {
        const locked = L.rooms[ch] && L.rooms[ch].locked;
        roomWindow(b, X, y, locked);
        if (!locked) lights.push([X + 8, y * T, 1.6]);
      }
    }
    // the ground floor: a door, and a shop window or a sign under each lintel
    const doorX = (() => {
      for (const dx of [Math.floor(cw / 2), Math.floor(cw / 2) - 1, Math.floor(cw / 2) + 1, 1, cw - 2]) {
        const x = x0 + dx;
        if (mapAt(x, F - 2) === '.' && mapAt(x, F) === '.' && mapAt(x, F - 1) === '.') return x;
      }
      return -1;
    })();
    if (doorX >= 0) {
      const X = doorX * T, y0 = (F - 1) * T - 2, y1 = (F + 1) * T;
      b.fillStyle = '#16100c'; b.fillRect(X + 1, y0 - 2, 14, y1 - y0 + 2);
      b.fillRect(X + 3, y0 - 4, 10, 2);
      for (let k = 0; k < 4; k++) { b.fillStyle = k % 2 ? NIGHT.woodD : shade(NIGHT.woodD, 1.25); b.fillRect(X + 2 + k * 3, y0, 3, y1 - y0); }
      b.fillStyle = '#121214'; b.fillRect(X + 2, y0 + 6, 12, 2); b.fillRect(X + 2, y1 - 9, 12, 2);
      b.fillStyle = '#a08a50'; b.fillRect(X + 11, y0 + 15, 1, 2);
      b.fillStyle = shade(rgb(...[96, 94, 90]), 0.9); b.fillRect(X, y1 - 2, 16, 2);       // the step
    }
    for (let x = x0; x < x0 + cw; x++) {
      if (mapAt(x, F - 2) !== '+' || x === doorX) continue;
      const X = x * T;
      if (hr() < 0.5) {
        const lit = hr() < 0.5;
        leaded(b, X + 2, (F - 2) * T + 6, 12, 17, lit, x * 7 + 3);
        b.fillStyle = shade(rgb(96, 94, 90), 1.1); b.fillRect(X + 1, (F - 1) * T + 7, 14, 2);
        if (lit) lights.push([X + 8, (F - 1) * T, 1]);
      } else {
        // a shop sign on an iron arm
        b.fillStyle = '#1a1512'; b.fillRect(X + 2, (F - 2) * T + 4, 12, 1);
        b.fillRect(X + 4, (F - 2) * T + 4, 1, 3); b.fillRect(X + 12, (F - 2) * T + 4, 1, 3);
        b.fillStyle = NIGHT.wood; b.fillRect(X + 2, (F - 2) * T + 7, 13, 9);
        b.fillStyle = NIGHT.woodL; b.fillRect(X + 2, (F - 2) * T + 7, 13, 1);
        b.fillStyle = ['#c9a13e', '#9a4a3a', '#d8d0bc'][Math.floor(hr() * 3)];
        const sx = X + 6, sy = (F - 2) * T + 9;
        [[1, 0], [2, 0], [0, 1], [3, 1], [0, 2], [3, 2], [1, 3], [2, 3]].forEach(([u, v]) => b.fillRect(sx + u, sy + v, 1, 1));
      }
    }
    // a few vines down from the eave, for the look of the thing (these can't be climbed)
    const leaf = ['#34461f', '#46602a', '#5a7634'];
    for (let i = 0; i < cw * L.art.moss * 0.5; i++) {
      let x = X0 + Math.floor(hr() * Wd), y = top + 6;
      const len = 14 + hr() * 50;
      for (let k = 0; k < len; k++) {
        b.fillStyle = '#26331a'; b.fillRect(x, y, 1, 1);
        if (hr() < 0.35) { b.fillStyle = leaf[Math.floor(hr() * 3)]; b.fillRect(x + (hr() < 0.5 ? -1 : 1), y, 2, 2); }
        y++; if (hr() < 0.25) x += hr() < 0.5 ? -1 : 1;
      }
    }
  }

  // A lit room window on a timbered front: casements thrown open, warm inside.
  function roomWindow(b, X, y, locked) {
    const x = X + 1, sy = (y - 1) * T + 2, ht = 2 * T - 3, wd = 14;
    b.fillStyle = NIGHT.timberD; b.fillRect(x - 2, sy - 3, wd + 4, ht + 4);
    if (locked) {
      for (let k = 0; k < wd; k += 3) { b.fillStyle = k % 6 ? NIGHT.wood : shade(NIGHT.wood, 0.85); b.fillRect(x + k, sy, 3, ht); b.fillStyle = NIGHT.woodD; b.fillRect(x + k + 2, sy, 1, ht); }
      // iron bars across, bolted, and a padlock
      for (const by of [sy + 6, sy + ht - 9]) {
        b.fillStyle = '#1a1a1e'; b.fillRect(x - 2, by, wd + 4, 3);
        b.fillStyle = '#7a7a84'; b.fillRect(x - 2, by, wd + 4, 1);
        b.fillStyle = '#9a9aa4'; b.fillRect(x - 1, by + 1, 1, 1); b.fillRect(x + wd, by + 1, 1, 1);
      }
      b.fillStyle = '#1a1a1e'; b.fillRect(x + 5, sy + 12, 5, 5);
      b.fillStyle = '#a08a50'; b.fillRect(x + 6, sy + 13, 3, 3);
      b.fillStyle = shade(rgb(150, 142, 124), 0.85); b.fillRect(x - 3, sy + ht, wd + 6, 3);
      return;
    }
    const g = b.createLinearGradient(0, sy, 0, sy + ht);
    g.addColorStop(0, '#ffdc8c'); g.addColorStop(0.6, '#d07a30'); g.addColorStop(1, '#5a2a14');
    b.fillStyle = g; b.fillRect(x, sy, wd, ht);
    b.fillStyle = 'rgba(60,30,14,0.7)'; b.fillRect(x + 2, sy + ht - 12, wd - 4, 12);   // the room beyond: a table edge, a shape
    b.fillStyle = 'rgba(255,245,210,0.35)'; b.fillRect(x + 1, sy + 1, 2, 9);
    // the casements, swung open against the wall
    for (const sx of [x - 6, x + wd + 2]) {
      b.fillStyle = NIGHT.timberD; b.fillRect(sx, sy, 4, ht);
      for (let py = 0; py < ht - 2; py++) for (let px = 0; px < 2; px++) {
        b.fillStyle = (px + py) % 3 ? 'rgba(255,200,120,0.55)' : NIGHT.lead;
        b.fillRect(sx + 1 + px, sy + 1 + py, 1, 1);
      }
    }
  }

  // A clay-tiled roof seen from the side: courses of tiles in a trapezoid from the
  // eave up to the ridge, barge boards up the slopes, a capped ridge.
  function paintRoof(b, w, L, h) {
    const [x0, cw, eave, k] = h;
    const hr = rng(x0 * 977 + L.art.seed);
    const base = hex(NIGHT.roof[Math.floor(hr() * NIGHT.roof.length)]);
    const yR = (eave - k - 1) * T, yE = eave * T + 5;
    const xl = x0 * T - 5, xr = (x0 + cw) * T + 5, tl = (x0 + k) * T, tr = (x0 + cw - k) * T;
    const mz = valueNoise(hr, 14);
    b.save();
    b.beginPath(); b.moveTo(xl, yE); b.lineTo(tl, yR); b.lineTo(tr, yR); b.lineTo(xr, yE); b.closePath(); b.clip();
    for (let y = yR, row = 0; y < yE; y += 4, row++) {
      const t = (y - yR) / (yE - yR);
      for (let x = xl - 6 + (row % 2) * 3; x < xr; x += 6) {
        const f = (0.82 + hr() * 0.26) * (1.12 - 0.3 * t);
        const m = mz(x, y);
        if (m > 1 - L.art.moss * 0.5 && hr() < 0.7) b.fillStyle = rgb(70 * f, 84 * f, 44 * f);
        else b.fillStyle = rgb(base[0] * f, base[1] * f, base[2] * f);
        b.fillRect(x, y, 6, 4);
        b.fillStyle = 'rgba(0,0,0,0.38)'; b.fillRect(x, y + 3, 6, 1); b.fillRect(x + 5, y, 1, 3);
        if (hr() < 0.3) { b.fillStyle = 'rgba(230,220,255,0.1)'; b.fillRect(x, y, 5, 1); }
      }
    }
    b.restore();
    thick(b, xl, yE, tl, yR, NIGHT.timberD, 2);
    thick(b, xr, yE, tr, yR, NIGHT.timberD, 2);
    for (let x = tl - 2; x < tr + 2; x += 4) {
      b.fillStyle = shade(rgb(...base), 0.75); b.fillRect(x, yR - 2, 4, 4);
      b.fillStyle = shade(rgb(...base), 1.25); b.fillRect(x + 1, yR - 2, 2, 1);
    }
    b.fillStyle = NIGHT.timberD; b.fillRect(xl, yE, xr - xl, 2);
    for (let i = 0; i < 9; i++) { b.fillStyle = 'rgba(8,8,14,' + (0.5 - i * 0.055) + ')'; b.fillRect(x0 * T, yE + 2 + i, cw * T, 1); }
  }

  // A stone building: coursed masonry, pilasters, battlements, tall windows.
  function paintStone(b, w, L, h, lights) {
    const [x0, cw, top] = h, A = L.art, F = w.H - 2;
    const X0 = x0 * T, Wd = cw * T, Y = top * T, Hd = (w.H - 1) * T - Y;
    masonry(b, X0, Y, Wd, Hd, A.stone, A.moss, A.seed + x0, (gx, gy) => 0.72 + 0.28 * (1 - gy / (w.H * T)));
    for (let cx = x0 + 1; cx < x0 + cw; cx += 4) {
      b.fillStyle = 'rgba(255,240,220,0.06)'; b.fillRect(cx * T, Y, 9, Hd);
      b.fillStyle = 'rgba(0,0,0,0.22)'; b.fillRect(cx * T + 9, Y, 2, Hd);
    }
    for (let X = X0; X < X0 + Wd; X += T) {
      b.fillStyle = shade(rgb(...A.stone), 0.85); b.fillRect(X + 1, Y - 7, 8, 7);
      b.fillStyle = shade(rgb(...A.stone), 1.2); b.fillRect(X + 1, Y - 7, 8, 1);
    }
    b.fillStyle = 'rgba(0,0,0,0.5)'; b.fillRect(X0 + Wd - 2, Y - 7, 2, Hd + 7);
    b.fillStyle = 'rgba(255,240,220,0.12)'; b.fillRect(X0, Y - 7, 1, Hd + 7);
    // tall lancet windows wherever three cells of plain wall stand one above another
    const mapAt = (x, y) => (L.map[y] && L.map[y][x]) || ' ';
    const glass = { abbey: ['#d8a050', '#a8402a', '#3a5a9a'], assize: ['#e0b060', '#c08040', '#e0b060'], keep: ['#3a4058', '#2a3044', '#3a4058'] }[L.id];
    for (let cx = x0 + 2; cx < x0 + cw - 1; cx += 4) {
      for (let r = top + 2; r + 2 < F - 1; r += 5) {
        let clear = true;
        for (let yy = r - 1; yy <= r + 3; yy++) for (const xx of [cx - 1, cx, cx + 1]) if (mapAt(xx, yy) !== '.') clear = false;
        if (!clear) continue;
        const wx = cx * T + 3, wy = r * T + 2, ww = 10, wh = 40;
        b.fillStyle = shade(rgb(...A.stone), 1.25); b.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
        b.fillStyle = '#0e0c0c'; b.fillRect(wx, wy + 3, ww, wh - 3); b.fillRect(wx + 2, wy + 1, ww - 4, 2); b.fillRect(wx + 4, wy, 2, 1);
        for (let py = 4; py < wh - 1; py++) for (let px = 1; px < ww - 1; px++) {
          if ((px + py) % 4 === 0 || (px - py + 400) % 4 === 0) continue;
          b.fillStyle = glass[(Math.floor(px / 3) + Math.floor(py / 6)) % 3];
          b.fillRect(wx + px, wy + py, 1, 1);
        }
        b.fillStyle = shade(rgb(...A.stone), 1.4); b.fillRect(wx - 3, wy + wh + 1, ww + 6, 2);
        if (L.id !== 'keep') lights.push([wx + 5, wy + 20, 1.2]);
      }
    }
    for (let y = Math.max(0, top - 1); y <= F; y++) for (let x = x0; x < x0 + cw; x++) {
      const ch = mapAt(x, y), X = x * T, Yc = y * T;
      if (ch === 'w') {
        b.fillStyle = shade(rgb(...A.stone), 1.15); b.fillRect(X + 5, Yc - 6, 6, 18);
        b.fillStyle = shade(rgb(...A.stone), 0.7); b.fillRect(X + 10, Yc - 6, 1, 18);
        b.fillStyle = '#0d0b0a'; b.fillRect(X + 7, Yc - 4, 2, 14);
      } else if ('123456789T'.includes(ch)) {
        const locked = ch !== 'T' && L.rooms[ch] && L.rooms[ch].locked;
        drawWindowArt(b, X, Yc, ch === 'T', locked, A.stone);
        if (!locked) lights.push([X + 8, Yc, ch === 'T' ? 2 : 1.6]);
      }
    }
    // cracks in the stone
    const cr = rng(A.seed + x0);
    for (let i = 0; i < cw * (w.H - top) / 20; i++) {
      let x = X0 + Math.floor(cr() * Wd), y = Y + Math.floor(cr() * Hd);
      const len = 8 + cr() * 30;
      for (let k = 0; k < len; k++) {
        b.fillStyle = 'rgba(20,17,14,0.7)'; b.fillRect(x, y, 1, 1);
        b.fillStyle = 'rgba(190,180,160,0.15)'; b.fillRect(x + 1, y, 1, 1);
        y += 1; x += cr() < 0.33 ? -1 : cr() < 0.5 ? 1 : 0;
      }
    }
  }

  // The things she stands on and holds, in front of the houses.
  function paintHolds(f, w, L) {
    const A = L.art, stone = A.stone, F = w.H - 2;
    const frnd = rng(A.seed + 99);
    const leaf = ['#34461f', '#46602a', '#5f7d35', '#7e9a45'];
    const top = (X, Y, wd) => { f.fillStyle = NIGHT.hold; f.fillRect(X, Y, wd, 1); };
    for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) {
      const c = at(w, x, y), X = x * T, Y = y * T;
      const h = houseAt(L, x), st = !!h && h[3] === 0;
      if (c === '=') {
        if (st) {
          // a stone cornice: pale worn top, darker face, a lip of shadow
          const L0 = at(w, x - 1, y) !== '=', R0 = at(w, x + 1, y) !== '=';
          f.fillStyle = shade(rgb(stone[0] * 1.5, stone[1] * 1.42, stone[2] * 1.28), 0.95 + frnd() * 0.08); f.fillRect(X, Y, T, 2);
          f.fillStyle = shade(rgb(stone[0] * 1.28, stone[1] * 1.2, stone[2] * 1.08), 0.95 + frnd() * 0.06); f.fillRect(X, Y + 2, T, 3);
          f.fillStyle = shade(rgb(...stone), 0.6); f.fillRect(X, Y + 5, T, 1);
          f.fillStyle = 'rgba(0,0,0,0.3)'; f.fillRect(X, Y + 6, T, 1);
          const seam = 3 + ((frnd() * 10) | 0);
          f.fillStyle = 'rgba(30,24,18,0.7)'; f.fillRect(X + seam, Y + 1, 1, 5);
          if (frnd() < A.moss * 0.8) { f.fillStyle = leaf[(frnd() * 4) | 0]; f.fillRect(X + ((frnd() * 13) | 0), Y, 3, 1); }
          if (L0) { f.fillStyle = 'rgba(255,245,225,0.25)'; f.fillRect(X, Y, 1, 5); }
          if (R0) { f.fillStyle = 'rgba(0,0,0,0.45)'; f.fillRect(X + T - 1, Y, 1, 6); }
          top(X, Y, T);
        } else if (h && (y === h[2] || y === h[2] - h[3] - 1)) {
          // the eave or the ridge of a roof: the tiles are in the back layer; here, the gutter
          if (y === h[2]) { f.fillStyle = '#26262c'; f.fillRect(X, Y + 3, T, 2); f.fillStyle = '#4a4a52'; f.fillRect(X, Y + 3, T, 1); }
          top(X, Y, T);
        } else if (!h) {
          // a plank bridge over an alley
          f.fillStyle = NIGHT.wood; f.fillRect(X, Y, T, 4);
          f.fillStyle = NIGHT.woodL; f.fillRect(X, Y, T, 1);
          f.fillStyle = NIGHT.woodD; f.fillRect(X, Y + 4, T, 1); f.fillRect(X + ((x * 7) % 12) + 2, Y + 1, 1, 3);
          f.fillStyle = '#9a9488'; f.fillRect(X + 2, Y + 1, 1, 1); f.fillRect(X + 13, Y + 1, 1, 1);
          if (at(w, x - 1, y) !== '=' || at(w, x + 1, y) !== '=') { f.fillStyle = NIGHT.woodD; f.fillRect(X + (at(w, x - 1, y) !== '=' ? 1 : 12), Y + 4, 3, 6); }
          top(X, Y, T);
        } else {
          // a balcony: planks on brackets, a rail behind
          f.fillStyle = NIGHT.woodD; f.fillRect(X, Y - 11, T, 2);
          f.fillStyle = NIGHT.wood; f.fillRect(X, Y - 12, T, 1);
          for (const px of [1, 8]) { f.fillStyle = NIGHT.woodD; f.fillRect(X + px, Y - 10, 2, 10); f.fillStyle = NIGHT.wood; f.fillRect(X + px, Y - 10, 1, 10); }
          f.fillStyle = NIGHT.wood; f.fillRect(X, Y, T, 4);
          f.fillStyle = NIGHT.woodL; f.fillRect(X, Y, T, 1);
          f.fillStyle = NIGHT.woodD; f.fillRect(X, Y + 4, T, 1);
          if (x % 2 === 0) thick(f, X + 2, Y + 5, X + 8, Y + 11, NIGHT.timberD, 2);
          f.fillStyle = 'rgba(0,0,0,0.3)'; f.fillRect(X, Y + 5, T, 3);
          top(X, Y, T);
        }
      } else if (c === '_') {
        // a rope, sagging a little in the middle of its span, with washing on the line
        let a = x, z = x;
        while (at(w, a - 1, y) === '_') a--;
        while (at(w, z + 1, y) === '_') z++;
        const span = (z - a + 1) * T;
        for (let px = 0; px < T; px++) {
          const u = (X + px - a * T) / span, sag = Math.round(Math.sin(u * Math.PI) * 2);
          f.fillStyle = '#7a6a50'; f.fillRect(X + px, Y + sag, 1, 1);
          f.fillStyle = '#3a3026'; f.fillRect(X + px, Y + sag + 1, 1, 1);
        }
        if (L.id === 'assize' && frnd() < 0.7) {
          const cloth = ['#8a8070', '#6a5a6a', '#7a5040', '#5a6a7a', '#9a9078'][(frnd() * 5) | 0];
          const cx = X + 3 + ((frnd() * 6) | 0), cwid = 5 + ((frnd() * 4) | 0), ch = 6 + ((frnd() * 6) | 0);
          f.fillStyle = cloth; f.fillRect(cx, Y + 2, cwid, ch);
          f.fillStyle = 'rgba(0,0,0,0.25)'; f.fillRect(cx + cwid - 1, Y + 2, 1, ch);
          f.fillStyle = '#c8c0a8'; f.fillRect(cx, Y + 1, 1, 2); f.fillRect(cx + cwid - 1, Y + 1, 1, 2);
        }
        if (at(w, x - 1, y) !== '_' || at(w, x + 1, y) !== '_') {
          const ex = at(w, x - 1, y) !== '_' ? X : X + T - 2;
          f.fillStyle = '#1a1512'; f.fillRect(ex, Y - 1, 2, 4);
        }
      } else if (c === '-') {
        if (st) {
          f.fillStyle = shade(rgb(stone[0] * 1.35, stone[1] * 1.3, stone[2] * 1.2), 1); f.fillRect(X + 2, Y, 12, 2);
          f.fillStyle = shade(rgb(...stone), 0.95); f.fillRect(X + 2, Y + 2, 12, 2);
          f.fillStyle = shade(rgb(...stone), 0.5); f.fillRect(X + 2, Y + 4, 12, 1);
          f.fillStyle = 'rgba(0,0,0,0.5)'; f.fillRect(X + 13, Y, 1, 5);
          top(X + 2, Y, 12);
        } else {
          // a window sill, on two little corbels
          f.fillStyle = shade(rgb(150, 142, 124), 0.9); f.fillRect(X, Y, T, 3);
          f.fillStyle = shade(rgb(150, 142, 124), 0.6); f.fillRect(X, Y + 3, T, 1);
          f.fillStyle = shade(rgb(150, 142, 124), 0.7); f.fillRect(X + 2, Y + 4, 2, 2); f.fillRect(X + 12, Y + 4, 2, 2);
          f.fillStyle = 'rgba(0,0,0,0.35)'; f.fillRect(X, Y + 4, T, 2);
          if (frnd() < 0.3) {
            // a box of something growing
            f.fillStyle = NIGHT.woodD; f.fillRect(X + 3, Y - 3, 10, 3);
            for (let k = 0; k < 6; k++) { f.fillStyle = frnd() < 0.3 ? '#a04a4a' : leaf[(frnd() * 3) | 0]; f.fillRect(X + 3 + ((frnd() * 9) | 0), Y - 5 + ((frnd() * 2) | 0), 2, 2); }
          }
          top(X, Y, T);
        }
      } else if (c === '+') {
        if (st) {
          f.fillStyle = shade(rgb(stone[0] * 1.35, stone[1] * 1.3, stone[2] * 1.2), 1); f.fillRect(X + 4, Y, 8, 3);
          f.fillStyle = 'rgba(0,0,0,0.5)'; f.fillRect(X + 4, Y + 3, 8, 2);
          top(X + 4, Y, 8);
        } else {
          // the end of a floor beam, jutting out of the front: hand-sized
          f.fillStyle = NIGHT.timberD; f.fillRect(X + 4, Y - 1, 8, 6);
          f.fillStyle = NIGHT.timberL; f.fillRect(X + 4, Y - 1, 8, 2);
          f.fillStyle = 'rgba(0,0,0,0.35)'; f.fillRect(X + 4, Y + 5, 8, 2);
          f.fillStyle = '#1a1210'; f.fillRect(X + 6, Y + 1, 1, 1); f.fillRect(X + 9, Y + 2, 1, 1);
          top(X + 4, Y - 1, 8);
        }
      } else if (c === '|') {
        f.fillStyle = '#1f2915'; f.fillRect(X + 7, Y, 2, T);
        f.fillRect(X + 5 + ((frnd() * 3) | 0), Y + 4, 1, 6);
        for (let k = 0; k < 26; k++) {
          const lx = X + 1 + ((frnd() * 13) | 0), ly = Y + ((frnd() * 15) | 0);
          f.fillStyle = leaf[(frnd() * 4) | 0]; f.fillRect(lx, ly, 2, 2);
          f.fillStyle = '#1b2412'; f.fillRect(lx + 1, ly + 2, 1, 1);
        }
        for (let k = 0; k < 4; k++) { f.fillStyle = '#9ab25a'; f.fillRect(X + 2 + ((frnd() * 11) | 0), Y + ((frnd() * 15) | 0), 1, 1); }
      } else if (c === 'x') {
        // a crate
        f.fillStyle = '#2a1d14'; f.fillRect(X, Y, T, T);
        f.fillStyle = '#6a4c34'; f.fillRect(X + 1, Y + 1, 14, 14);
        for (let k = 0; k < 3; k++) { f.fillStyle = '#4a3424'; f.fillRect(X + 1, Y + 5 + k * 5, 14, 1); }
        f.fillStyle = '#7a5a3e'; f.fillRect(X + 1, Y + 1, 2, 14); f.fillRect(X + 13, Y + 1, 2, 14);
        thick(f, X + 3, Y + 13, X + 12, Y + 3, '#5a4030', 2);
        top(X, Y, T);
      } else if (c === '%') {
        // a hay cart: heaped straw on a cart bed, wheels below
        f.fillStyle = NIGHT.woodD; f.fillRect(X, Y + 8, T, 4);
        f.fillStyle = NIGHT.wood; f.fillRect(X, Y + 8, T, 1);
        const straw = ['#b89a4a', '#8f7434', '#d4b860', '#a0843c'];
        for (let k = 0; k < 60; k++) {
          const sx = X + ((frnd() * 16) | 0), sy = Y - 2 + ((frnd() * 10) | 0);
          f.fillStyle = straw[(frnd() * 4) | 0]; f.fillRect(sx, sy, 1, 2);
        }
        if (at(w, x - 1, y) !== '%' || at(w, x + 1, y) !== '%') {
          const wx = X + 8;
          f.fillStyle = '#1a1210'; f.fillRect(wx - 5, Y + 11, 10, 5);
          f.fillStyle = NIGHT.wood; f.fillRect(wx - 4, Y + 12, 8, 3);
          f.fillStyle = '#1a1210'; f.fillRect(wx - 1, Y + 12, 2, 3);
        }
        top(X, Y - 1, T);
      } else if (c === '#') {
        // cobbles: rounded stones, moonlit tops
        f.fillStyle = '#1c1c22'; f.fillRect(X, Y, T, T);
        for (let r = 0; r < 4; r++) for (let k = -1; k < 3; k++) {
          const cx = X + k * 6 + ((r + y) % 2) * 3 + ((frnd() * 2) | 0), cy = Y + r * 4;
          const l = 0.8 + frnd() * 0.3;
          f.fillStyle = rgb(70 * l, 70 * l, 78 * l); f.fillRect(Math.max(X, cx), cy, Math.min(5, X + T - Math.max(X, cx)), 3);
          f.fillStyle = rgb(100 * l, 100 * l, 110 * l); if (cx >= X && cx + 4 <= X + T) f.fillRect(cx + 1, cy, 3, 1);
        }
        if (at(w, x, y - 1) !== '#') { f.fillStyle = '#5a5a64'; f.fillRect(X, Y, T, 1); }
      }
    }
    // the sparrow marks: the thieves' sign, chalked at head height
    for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) {
      if (decoAt(w, x, y) !== 'C') continue;
      f.fillStyle = '#e4ddcc';
      const sx = x * T + 4, sy = y * T - 8;
      [[0, 2], [1, 1], [2, 2], [3, 2], [4, 1], [5, 1], [6, 0], [2, 3], [3, 3], [4, 3], [3, 4], [1, 4]].forEach(([a, c]) => f.fillRect(sx + a, sy + c, 1, 1));
    }
  }

  function buildArt(li) {
    if (art[li]) return art[li];
    const L = LEVELS[li], w = parseLevel(L), A = L.art;
    const W = w.W * T, H = w.H * T;
    const bg = mk(W, H), b = bg.getContext('2d');
    const fg = mk(W, H), f = fg.getContext('2d');
    const lights = [];
    for (const h of L.houses) if (h[3] === 0) paintStone(b, w, L, h, lights); else paintHouse(b, w, L, h, lights);
    for (const h of L.houses) if (h[3] > 0) paintRoof(b, w, L, h);
    for (const q of w.torches) {
      // the iron arm a lantern hangs from (the lantern itself is drawn live, flickering)
      const X = q.x * T, Y = q.y * T;
      b.fillStyle = '#1a1512'; b.fillRect(X + 2, Y + 1, 9, 2); b.fillRect(X + 2, Y + 1, 2, 9);
      lights.push([X + 9, Y + 8, 1.4]);
    }
    // night over everything, deeper toward the street; then lamplight on the walls
    b.save();
    b.globalCompositeOperation = 'source-atop';
    b.fillStyle = 'rgba(18,26,64,0.2)'; b.fillRect(0, 0, W, H);
    const fog = b.createLinearGradient(0, H * 0.3, 0, H);
    fog.addColorStop(0, 'rgba(12,16,32,0)'); fog.addColorStop(1, 'rgba(12,16,32,0.42)');
    b.fillStyle = fog; b.fillRect(0, 0, W, H);
    for (const [x, y, s] of lights) {
      const r = 30 * s, g = b.createRadialGradient(x, y, 2, x, y, r);
      g.addColorStop(0, 'rgba(255,170,80,0.3)'); g.addColorStop(1, 'rgba(255,150,70,0)');
      b.fillStyle = g; b.fillRect(x - r, y - r, r * 2, r * 2);
    }
    b.restore();
    paintHolds(f, w, L);

    // the sky above the roofs, and a strip of street below the bottom row
    const W2 = W, H2 = PAD_TOP + H + PAD_BOT;
    const pad = (src, street) => {
      const cv = mk(W2, H2), c = cv.getContext('2d');
      c.drawImage(src, 0, PAD_TOP);
      if (street) for (let y = PAD_TOP + H; y < H2; y += T) c.drawImage(src, 0, H - T, W, T, 0, y, W, T);
      return cv;
    };
    const out = { bg: pad(bg, false), fg: pad(fg, true), W: W2, H: H2, ox: 0, oy: PAD_TOP, lights };
    out.camMaxY = H2 - PAD_TOP - VH;
    out.sky = buildSky(A);
    out.far = buildSkyline(L, Math.ceil(VW + W2 * FAR_K) + 2);
    out.near = buildBackRow(L, Math.ceil(VW + W2 * NEAR_K) + 2);
    art[li] = out;
    return out;
  }

  function buildSky(A) {
    const cv = mk(VW, VH), c = cv.getContext('2d');
    const g = c.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, A.sky[0]); g.addColorStop(1, A.sky[1]);
    c.fillStyle = g; c.fillRect(0, 0, VW, VH);
    const r = rng(A.seed + 7);
    for (let k = 0; k < 140; k++) {
      const y = Math.floor(r() * VH * 0.7);
      c.fillStyle = 'rgba(225,225,210,' + (0.2 + r() * 0.6) * (1 - y / VH) + ')';
      c.fillRect(Math.floor(r() * VW), y, 1, 1);
    }
    // long low clouds, lit from underneath by the moon
    for (let k = 0; k < 5; k++) {
      const cx = r() * VW, cy = 30 + r() * 70, cw = 80 + r() * 120;
      for (let i = 0; i < 26; i++) {
        const ex = cx + (r() - 0.5) * cw, ey = cy + (r() - 0.5) * 8, rr = 6 + r() * 10;
        c.fillStyle = 'rgba(40,48,72,0.22)'; c.beginPath(); c.ellipse(ex, ey, rr * 1.8, rr * 0.6, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(150,160,190,0.06)'; c.fillRect(Math.round(ex - rr), Math.round(ey + rr * 0.4), Math.round(rr * 2), 1);
      }
    }
    return cv;
  }

  // The far town: hills, a jumble of roofs and spires, and the place the contract
  // ends — the abbey's spire, the Assize dome, the keep on its hill.
  function buildSkyline(L, FW) {
    const FH = VH + 40, base = FH - 30;
    const cv = mk(FW, FH), c = cv.getContext('2d'), r = rng(L.art.seed + 31);
    c.fillStyle = '#141a28';
    c.beginPath(); c.moveTo(0, FH);
    for (let x = 0; x <= FW; x += 8) c.lineTo(x, base - 70 - Math.sin(x / 90) * 18 - Math.sin(x / 37 + 1) * 8);
    c.lineTo(FW, FH); c.closePath(); c.fill();
    const col = '#1b2233', lit = 'rgba(230,160,80,0.75)';
    const block = (x, wd, ht, gable) => {
      c.fillStyle = col; c.fillRect(x, base - ht, wd, ht + 30);
      c.beginPath();
      if (gable) { c.moveTo(x - 1, base - ht); c.lineTo(x + wd / 2, base - ht - wd * 0.6); c.lineTo(x + wd + 1, base - ht); }
      else { c.moveTo(x - 2, base - ht); c.lineTo(x + 5, base - ht - 9); c.lineTo(x + wd - 5, base - ht - 9); c.lineTo(x + wd + 2, base - ht); }
      c.closePath(); c.fill();
      for (let k = 0; k < wd * ht / 260; k++) if (r() < 0.45) { c.fillStyle = lit; c.fillRect(Math.round(x + 2 + r() * (wd - 4)), Math.round(base - ht + 4 + r() * (ht - 8)), 1, 2); }
    };
    // the landmark, about three quarters of the way along
    const lx = Math.round(FW * 0.72);
    c.fillStyle = '#18202f';
    if (L.id === 'abbey') {
      c.fillRect(lx - 70, base - 60, 120, 90);
      c.beginPath(); c.moveTo(lx - 74, base - 60); c.lineTo(lx - 10, base - 90); c.lineTo(lx + 54, base - 60); c.fill();
      c.fillRect(lx + 30, base - 130, 26, 160);
      c.beginPath(); c.moveTo(lx + 27, base - 130); c.lineTo(lx + 43, base - 196); c.lineTo(lx + 59, base - 130); c.fill();
      for (let k = 0; k < 5; k++) { c.fillStyle = 'rgba(220,150,70,0.6)'; c.fillRect(lx - 60 + k * 22, base - 46, 3, 10); }
      c.fillStyle = 'rgba(240,170,80,0.8)'; c.fillRect(lx + 40, base - 118, 5, 7);
    } else if (L.id === 'assize') {
      c.fillRect(lx - 80, base - 70, 170, 100);
      c.fillRect(lx - 30, base - 96, 70, 30);
      c.beginPath(); c.arc(lx + 5, base - 96, 34, Math.PI, 0); c.fill();
      c.fillRect(lx + 2, base - 140, 6, 14);
      c.fillRect(lx - 80, base - 100, 18, 40); c.fillRect(lx + 72, base - 100, 18, 40);
      for (let k = 0; k < 7; k++) { c.fillStyle = 'rgba(220,160,80,0.55)'; c.fillRect(lx - 70 + k * 23, base - 52, 4, 9); }
    } else {
      c.beginPath(); c.moveTo(lx - 150, base + 10); c.quadraticCurveTo(lx, base - 110, lx + 150, base + 10); c.fill();
      c.fillRect(lx - 70, base - 110, 140, 40);
      for (let k = -70; k < 70; k += 10) c.fillRect(lx + k, base - 116, 6, 6);
      c.fillRect(lx - 18, base - 180, 40, 80);
      for (let k = -18; k < 22; k += 9) c.fillRect(lx + k, base - 187, 6, 7);
      c.fillRect(lx - 70, base - 140, 18, 40); c.fillRect(lx + 52, base - 140, 18, 40);
      c.fillStyle = 'rgba(240,140,60,0.85)';
      [[0, -168], [6, -150], [-8, -130], [-62, -128], [60, -126]].forEach(([u, v]) => c.fillRect(lx + u, base + v, 2, 3));
    }
    for (let x = -10; x < FW; ) {
      const wd = 14 + Math.floor(r() * 26), ht = 14 + Math.floor(r() * 34);
      if (Math.abs(x + wd / 2 - lx) > 90 || L.id === 'keep') block(x, wd, ht, r() < 0.5);
      if (r() < 0.07) { c.fillStyle = col; c.fillRect(x + wd / 2 - 2, base - ht - 40, 5, 40); c.beginPath(); c.moveTo(x + wd / 2 - 4, base - ht - 40); c.lineTo(x + wd / 2 + 0.5, base - ht - 62); c.lineTo(x + wd / 2 + 5, base - ht - 40); c.fill(); }
      x += wd + (r() < 0.3 ? 4 : 0);
    }
    const haze = c.createLinearGradient(0, base - 110, 0, FH);
    haze.addColorStop(0, 'rgba(70,80,110,0)'); haze.addColorStop(1, 'rgba(70,80,110,0.35)');
    c.fillStyle = haze; c.fillRect(0, 0, FW, FH);
    return cv;
  }

  // The row of houses across the street behind, in shadow: what shows through the
  // alleys and over the lower roofs.
  function buildBackRow(L, NW) {
    const NH = VH + 64, base = NH - 32;
    const cv = mk(NW, NH), c = cv.getContext('2d'), r = rng(L.art.seed + 53);
    const walls = ['#2f3446', '#2b3042', '#343849', '#2d3040'];
    for (let x = -20; x < NW; ) {
      const wd = 40 + Math.floor(r() * 56), ht = 60 + Math.floor(r() * 120), gable = r() < 0.4;
      const wall = walls[Math.floor(r() * walls.length)];
      c.fillStyle = wall; c.fillRect(x, base - ht, wd, ht + 40);
      c.fillStyle = '#1d2030';
      c.fillRect(x, base - ht, 2, ht); c.fillRect(x + wd - 2, base - ht, 2, ht);
      for (let y = base - 48; y > base - ht + 8; y -= 48) c.fillRect(x, y, wd, 3);
      for (let y = base - ht + 14; y < base - 10; y += 48) for (let wx = x + 8; wx < x + wd - 12; wx += 18) {
        const lit = r() < 0.32;
        c.fillStyle = '#171a26'; c.fillRect(wx - 1, y - 1, 10, 16);
        c.fillStyle = lit ? (r() < 0.5 ? '#c98a44' : '#a86a34') : '#232838';
        c.fillRect(wx, y, 8, 14);
        c.fillStyle = '#171a26'; c.fillRect(wx + 4, y, 1, 14); c.fillRect(wx, y + 5, 8, 1);
      }
      c.fillStyle = '#262431';
      c.beginPath();
      if (gable) { c.moveTo(x - 3, base - ht); c.lineTo(x + wd / 2, base - ht - wd * 0.55); c.lineTo(x + wd + 3, base - ht); }
      else { c.moveTo(x - 4, base - ht + 2); c.lineTo(x + 10, base - ht - 22); c.lineTo(x + wd - 10, base - ht - 22); c.lineTo(x + wd + 4, base - ht + 2); }
      c.closePath(); c.fill();
      if (r() < 0.5) { c.fillStyle = '#2a2a34'; c.fillRect(x + wd * 0.7, base - ht - 30, 7, 22); }
      x += wd + (r() < 0.35 ? 10 + Math.floor(r() * 30) : 0);
    }
    c.fillStyle = '#1a1e2a'; c.fillRect(0, base, NW, NH - base);
    const haze = c.createLinearGradient(0, base - 120, 0, NH);
    haze.addColorStop(0, 'rgba(30,40,64,0)'); haze.addColorStop(1, 'rgba(30,40,64,0.55)');
    c.fillStyle = haze; c.fillRect(0, 0, NW, NH);
    return cv;
  }

  const MOON = (() => {
    const cv = mk(80, 80), c = cv.getContext('2d');
    const g = c.createRadialGradient(40, 40, 8, 40, 40, 40);
    g.addColorStop(0, 'rgba(220,225,240,0.35)'); g.addColorStop(1, 'rgba(200,210,240,0)');
    c.fillStyle = g; c.fillRect(0, 0, 80, 80);
    for (let y = -12; y <= 12; y++) for (let x = -12; x <= 12; x++) {
      if (x * x + y * y > 144) continue;
      const k = 0.86 + 0.14 * Math.sin(x * 0.7 + y * 0.4) * Math.cos(y * 0.5);
      c.fillStyle = rgb(236 * k, 234 * k, 220 * k); c.fillRect(40 + x, 40 + y, 1, 1);
    }
    c.fillStyle = 'rgba(150,150,150,0.35)'; c.fillRect(35, 35, 4, 3); c.fillRect(43, 42, 3, 3); c.fillRect(38, 45, 2, 2);
    return cv;
  })();

  // The whole town behind her at a camera position (world pixels; y from the top
  // of the map).
  function drawTown(c, A, cx, cy) {
    c.drawImage(A.sky, 0, 0);
    c.drawImage(MOON, Math.round(VW * 0.74 - cx * 0.02) - 40, Math.round(8 + Math.max(0, -cy) * 0.04));
    for (const [layer, k] of [[A.far, FAR_K], [A.near, NEAR_K]]) {
      const dy = Math.round(VH - layer.height - (cy - A.camMaxY) * k);
      c.drawImage(layer, Math.round(cx * k), 0, VW, layer.height, 0, dy, VW, layer.height);
    }
    c.drawImage(A.bg, cx, cy + A.oy, VW, VH, 0, 0, VW, VH);
  }

  function drawWindowArt(b, X, Y, isTarget, locked, stone) {
    // An arched opening two cells tall, sill at her feet.
    const cx = X + 8, top = Y - 20, bot = Y + 15, wdt = isTarget ? 14 : 12;
    const lx = cx - wdt / 2;
    b.fillStyle = shade(rgb(...stone), 1.3);
    b.fillRect(lx - 3, top + 2, wdt + 6, bot - top);
    b.fillRect(lx - 1, top - 1, wdt + 2, 4);
    b.fillStyle = shade(rgb(...stone), 0.7);
    b.fillRect(lx + wdt + 2, top + 3, 1, bot - top - 2);
    // voussoir joints
    b.fillStyle = 'rgba(30,24,18,0.6)';
    b.fillRect(lx - 3, top + 8, 3, 1); b.fillRect(lx + wdt, top + 8, 3, 1); b.fillRect(cx, top - 1, 1, 3);
    // the opening
    const g = b.createLinearGradient(0, top, 0, bot);
    if (locked) { g.addColorStop(0, '#3a2819'); g.addColorStop(1, '#241810'); }
    else if (isTarget) { g.addColorStop(0, '#f4c870'); g.addColorStop(0.5, '#c0602a'); g.addColorStop(1, '#5a2014'); }
    else { g.addColorStop(0, '#f0c070'); g.addColorStop(0.6, '#b36a2c'); g.addColorStop(1, '#4a2614'); }
    b.fillStyle = g;
    b.fillRect(lx, top + 3, wdt, bot - top - 4);
    b.fillRect(lx + 2, top + 1, wdt - 4, 2);
    if (locked) {
      b.fillStyle = '#5a3c24';
      for (let k = 0; k < wdt; k += 3) b.fillRect(lx + k, top + 3, 2, bot - top - 4);
      b.fillStyle = '#2a2a2e'; b.fillRect(lx - 1, top + 14, wdt + 2, 2); b.fillRect(lx - 1, top + 24, wdt + 2, 2);
    } else {
      b.fillStyle = 'rgba(40,24,14,0.85)';
      b.fillRect(cx - 1, top + 2, 1, bot - top - 3); b.fillRect(lx, top + 14, wdt, 1);
      b.fillStyle = 'rgba(255,240,200,0.35)'; b.fillRect(lx + 1, top + 4, 2, 8);
      if (isTarget) {
        // leaded panes of coloured glass
        b.fillStyle = 'rgba(150,30,30,0.45)'; b.fillRect(lx + 1, top + 16, 4, 6);
        b.fillStyle = 'rgba(40,70,140,0.45)'; b.fillRect(cx + 1, top + 5, 5, 7);
      }
      // open shutters
      b.fillStyle = '#4a3322'; b.fillRect(lx - 7, top + 5, 4, bot - top - 7); b.fillRect(lx + wdt + 3, top + 5, 4, bot - top - 7);
      b.fillStyle = '#6a4a30'; b.fillRect(lx - 7, top + 5, 1, bot - top - 7); b.fillRect(lx + wdt + 3, top + 5, 1, bot - top - 7);
    }
    // sill
    b.fillStyle = shade(rgb(...stone), 1.45); b.fillRect(lx - 4, bot - 1, wdt + 8, 2);
    b.fillStyle = 'rgba(0,0,0,0.4)'; b.fillRect(lx - 4, bot + 1, wdt + 8, 2);
  }

  const roomBgs = {};
  function roomBg(theme) {
    if (roomBgs[theme]) return roomBgs[theme];
    const cv = mk(VW, VH), c = cv.getContext('2d');
    const th = THEMES[theme];
    const r = rng(theme.length * 131 + 7);
    const back = proj(0, 0), backR = proj(1, 0), top = proj(0, 0, WALL_H).y;
    // ceiling, with one beam across it
    c.fillStyle = shade(th.beam, 0.8); c.fillRect(0, 0, VW, VH);
    const bm = proj(0, 0.2, WALL_H).y;
    c.fillStyle = th.beam; c.fillRect(0, Math.round(bm) - 4, VW, 6);
    c.fillStyle = shade(th.beam, 1.35); c.fillRect(0, Math.round(bm) - 4, VW, 1);
    // back wall
    wallTexture(c, theme, Math.round(back.x), Math.round(top), Math.round(backR.x - back.x), Math.round(back.y - top), r);
    // side walls, a column at a time, each at its own depth
    for (let side = 0; side < 2; side++) {
      for (let i = 0; i < Math.round(back.x); i++) {
        const x = side ? VW - 1 - i : i;
        const k = kAtX(i);
        const v = (k - 0.75) / 1.04;
        const y0 = Math.round(HORIZON + k * (EYE - WALL_H)), y1 = Math.round(HORIZON + k * EYE);
        const dim = side ? 0.6 : 0.72;
        c.fillStyle = shade(th.wall, dim); c.fillRect(x, y0, 1, y1 - y0);
        // courses and joints, converging on the back wall
        c.fillStyle = shade(th.wall, dim * 0.72);
        if (theme === 'abbey') {
          for (let h = 12; h < WALL_H; h += 12) c.fillRect(x, Math.round(HORIZON + k * (EYE - h)), 1, 1);
          if (Math.floor(v * 40) !== Math.floor(((VW / 2 - (i + 1)) / (VW / 2) - 0.75) / 1.04 * 40)) c.fillRect(x, y0, 1, y1 - y0);
        } else if (theme === 'assize') {
          const py = Math.round(HORIZON + k * (EYE - 74));
          c.fillStyle = shade(th.panel, dim); c.fillRect(x, py, 1, y1 - py);
          c.fillStyle = shade(th.panel, dim * 1.4); c.fillRect(x, py, 1, 2);
        } else if (r() < 0.5) c.fillRect(x, y0 + ((r() * (y1 - y0)) | 0), 1, 1);
        // skirting
        c.fillStyle = th.trim; c.fillRect(x, y1 - Math.round(4 * k), 1, Math.round(4 * k));
        // the window on the left wall, the door on the right
        if (!side && v >= WIN.v0 && v <= WIN.v1) {
          const wy0 = Math.round(HORIZON + k * (EYE - WIN.h1)), wy1 = Math.round(HORIZON + k * (EYE - WIN.h0));
          const edge = v - WIN.v0 < 0.012 || WIN.v1 - v < 0.012;
          c.fillStyle = edge ? shade(th.wall, 0.45) : '#141a2a'; c.fillRect(x, wy0, 1, wy1 - wy0);
          if (!edge) {
            for (let yy = wy0; yy < wy1; yy++) if (r() < 0.012) { c.fillStyle = '#c8c6b8'; c.fillRect(x, yy, 1, 1); }
            c.fillStyle = '#1e2536'; c.fillRect(x, wy1 - Math.round((wy1 - wy0) * 0.3), 1, Math.round((wy1 - wy0) * 0.3));
            c.fillStyle = '#2a2018'; c.fillRect(x, Math.round((wy0 + wy1) / 2), 1, 2);
            if (Math.abs(v - (WIN.v0 + WIN.v1) / 2) < 0.006) c.fillRect(x, wy0, 1, wy1 - wy0);
          }
          c.fillStyle = shade(th.wall, 1.3); c.fillRect(x, wy1, 1, 2);
        }
        if (side && v >= DOOR.v0 && v <= DOOR.v1) {
          const dy0 = Math.round(HORIZON + k * (EYE - DOOR.h1));
          const edge = v - DOOR.v0 < 0.01 || DOOR.v1 - v < 0.01;
          c.fillStyle = edge ? shade(th.wall, 0.35) : (Math.floor(v * 90) % 2 ? '#3e2a1c' : '#4a3222'); c.fillRect(x, dy0, 1, y1 - dy0);
          if (!edge) { c.fillStyle = '#26262a'; c.fillRect(x, Math.round(HORIZON + k * (EYE - 80)), 1, 2); c.fillRect(x, Math.round(HORIZON + k * (EYE - 25)), 1, 2); }
          if (Math.abs(v - DOOR.v0 - 0.03) < 0.004) { c.fillStyle = '#b09050'; c.fillRect(x, Math.round(HORIZON + k * (EYE - 48)), 1, 2); }
        }
      }
    }
    // the floor: boards running away from you, butt joints staggered
    const N = 13;
    for (let y = Math.round(back.y); y < VH; y++) {
      const k = (y - HORIZON) / EYE, v = (k - 0.75) / 1.04;
      const w = VW * k, xl = VW / 2 - w / 2;
      for (let i = 0; i < N; i++) {
        const xa = Math.max(0, Math.round(xl + w * i / N)), xb = Math.min(VW, Math.round(xl + w * (i + 1) / N));
        if (xb <= xa) continue;
        const off = ((i * 37) % 10) / 10;
        const seg = Math.floor(v * 3.2 + off), prev = Math.floor((v - 1 / (EYE * 1.04)) * 3.2 + off);
        const lum = 0.82 + (((i * 7 + seg * 13) % 9) / 9) * 0.3;
        c.fillStyle = seg !== prev ? th.floorD : shade(th.floor, lum * (0.8 + v * 0.3));
        c.fillRect(xa, y, xb - xa, 1);
        c.fillStyle = th.floorD; c.fillRect(xa, y, 1, 1);
      }
    }
    // skirting along the back wall
    c.fillStyle = th.trim; c.fillRect(Math.round(back.x), Math.round(back.y) - 3, Math.round(backR.x - back.x), 3);
    c.fillStyle = shade(th.trim, 1.6); c.fillRect(Math.round(back.x), Math.round(back.y) - 3, Math.round(backR.x - back.x), 1);
    // corners
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(Math.round(back.x) - 1, Math.round(top), 2, Math.round(back.y - top));
    c.fillRect(Math.round(backR.x) - 1, Math.round(top), 2, Math.round(back.y - top));
    // moonlight from the window, laid across the floor
    const a = proj(0, WIN.v0 + 0.02), b = proj(0, WIN.v1 - 0.02), a2 = proj(0.45, WIN.v0 + 0.18), b2 = proj(0.55, WIN.v1 + 0.3);
    c.fillStyle = 'rgba(160,180,230,0.07)';
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(a2.x, a2.y); c.lineTo(b2.x, b2.y); c.lineTo(b.x, b.y); c.closePath(); c.fill();
    roomBgs[theme] = cv;
    return cv;
  }

  // The back wall's pattern, in a rectangle at the back wall's scale (0.75).
  function wallTexture(c, theme, X, Y, W, H, r) {
    const th = THEMES[theme];
    c.fillStyle = th.wall; c.fillRect(X, Y, W, H);
    if (theme === 'abbey') {
      for (let y = Y; y < Y + H; y += 9) {
        let x = X - (((y - Y) / 9) % 2) * 10;
        while (x < X + W) {
          const bw = 16 + ((r() * 11) | 0), x0 = Math.max(X, x), x1 = Math.min(X + W, x + bw);
          c.fillStyle = shade(th.wall, 0.86 + r() * 0.24); c.fillRect(x0 + 1, y + 1, x1 - x0 - 1, 8);
          c.fillStyle = shade(th.wall, 1.18); c.fillRect(x0 + 1, y + 1, x1 - x0 - 1, 1);
          c.fillStyle = th.wallD; c.fillRect(x0, y, x1 - x0, 1); c.fillRect(x0, y, 1, 9);
          x += bw;
        }
      }
    } else if (theme === 'assize') {
      const py = Y + H - Math.round(74 * 0.75);
      for (let x = X; x < X + W; x += 2) { c.fillStyle = ((x - X) / 2) % 6 < 3 ? th.wall : shade(th.wall, 0.9); c.fillRect(x, Y, 2, py - Y); }
      for (let y = Y + 6; y < py - 4; y += 11) for (let x = X + 4; x < X + W; x += 15) { c.fillStyle = th.wallL; c.fillRect(x + (((y - Y) / 11) % 2) * 7, y, 2, 2); }
      c.fillStyle = th.panel; c.fillRect(X, py, W, Y + H - py);
      for (let x = X + 3; x < X + W - 26; x += 30) {
        c.fillStyle = th.panelD; c.fillRect(x, py + 6, 26, Y + H - py - 12);
        c.fillStyle = shade(th.panel, 1.15); c.fillRect(x + 2, py + 8, 22, Y + H - py - 16);
      }
      c.fillStyle = shade(th.panel, 1.4); c.fillRect(X, py, W, 2);
    } else {
      for (let k = 0; k < 700; k++) { c.fillStyle = r() < 0.5 ? shade(th.wall, 0.92) : shade(th.wall, 1.07); c.fillRect(X + ((r() * W) | 0), Y + ((r() * H) | 0), 2, 1); }
      // a tapestry of wheat sheaves, faded
      const tx = X + Math.round(W / 2) - 32, ty = Y + 8;
      c.fillStyle = '#3a1818'; c.fillRect(tx, ty, 64, 76);
      c.fillStyle = th.tapestry; c.fillRect(tx + 2, ty + 2, 60, 70);
      c.fillStyle = '#8a3a30'; c.fillRect(tx + 2, ty + 2, 60, 3); c.fillRect(tx + 2, ty + 66, 60, 6);
      for (let k = 0; k < 4; k++) {
        const sx = tx + 10 + k * 14;
        c.fillStyle = '#b08a3e'; c.fillRect(sx, ty + 20, 2, 34);
        for (let j = 0; j < 5; j++) { c.fillRect(sx - 2, ty + 17 + j * 4, 2, 2); c.fillRect(sx + 2, ty + 19 + j * 4, 2, 2); }
      }
      c.fillStyle = '#c9a44a'; for (let x = tx + 2; x < tx + 62; x += 4) c.fillRect(x, ty + 72, 2, 4);
    }
  }

  function drawSpot(c, sp, tm, theme, dark) {
    const k = sp.kind, x = Math.round(sp.x), done = sp.done;
    const F = FLOOR;
    const wood = '#5a3a24', woodL = '#7a5234', woodD = '#3a2416';
    switch (k) {
      case 'desk':
        c.fillStyle = woodD; c.fillRect(x - 28, F - 30, 4, 30); c.fillRect(x + 24, F - 30, 4, 30);
        c.fillStyle = wood; c.fillRect(x - 30, F - 34, 60, 6); c.fillStyle = woodL; c.fillRect(x - 30, F - 34, 60, 1);
        c.fillStyle = woodD; c.fillRect(x + 4, F - 28, 20, 12);
        c.fillStyle = wood; c.fillRect(x + 5, F - 27, 18, 10);
        c.fillStyle = '#b09050'; c.fillRect(x + 13, F - 23, 2, 2);
        if (done) { c.fillStyle = wood; c.fillRect(x + 8, F - 20, 22, 8); c.fillStyle = woodD; c.fillRect(x + 8, F - 13, 22, 1); }
        // papers, a quill, an inkpot
        c.fillStyle = '#d8d0b8'; c.fillRect(x - 20, F - 36, 14, 2); c.fillRect(x - 16, F - 37, 10, 1);
        c.fillStyle = '#1c1a1e'; c.fillRect(x + 6, F - 38, 4, 4);
        c.fillStyle = '#e8e2d0'; c.fillRect(x + 9, F - 45, 1, 8); c.fillRect(x + 10, F - 46, 1, 3);
        break;
      case 'shelf': {
        c.fillStyle = woodD; c.fillRect(x - 20, F - 88, 40, 88);
        c.fillStyle = wood; c.fillRect(x - 18, F - 86, 36, 84);
        const rr = rng(x);
        for (let s = 0; s < 4; s++) {
          const sy = F - 84 + s * 21;
          c.fillStyle = woodD; c.fillRect(x - 18, sy + 17, 36, 3);
          let bx = x - 17;
          while (bx < x + 15) {
            const bw = 2 + ((rr() * 3) | 0), bh = 11 + ((rr() * 6) | 0);
            if (done && s === 1 && bx > x - 4 && bx < x + 8) { bx += bw; continue; }
            c.fillStyle = ['#6b2d2a', '#2d4a3a', '#4a3a24', '#2a3450', '#7a6a4a', '#5a2a4a'][(rr() * 6) | 0];
            c.fillRect(bx, sy + 17 - bh, bw, bh);
            c.fillStyle = 'rgba(255,230,180,0.25)'; c.fillRect(bx, sy + 17 - bh + 2, bw, 1);
            bx += bw + (rr() < 0.2 ? 2 : 0);
          }
        }
        c.fillStyle = woodL; c.fillRect(x - 20, F - 88, 40, 2);
        break;
      }
      case 'painting':
        if (done) {
          c.fillStyle = '#1b1614'; c.fillRect(x - 8, 70, 16, 18);
          c.fillStyle = '#2d2a28'; c.fillRect(x - 8, 70, 16, 2);
          c.save(); c.translate(x + 6, 62); c.rotate(0.22); c.translate(-(x + 6), -62);
        }
        c.fillStyle = '#8a6a2a'; c.fillRect(x - 16, 62, 32, 36);
        c.fillStyle = '#c9a13e'; c.fillRect(x - 16, 62, 32, 2); c.fillRect(x - 16, 62, 2, 36);
        c.fillStyle = '#3a4a3a'; c.fillRect(x - 12, 66, 24, 28);
        c.fillStyle = '#5a6a48'; c.fillRect(x - 12, 82, 24, 12);
        c.fillStyle = '#c8b890'; c.fillRect(x - 3, 70, 6, 8);
        c.fillStyle = '#6b2a2a'; c.fillRect(x - 4, 76, 8, 14);
        c.fillStyle = '#d8c8a0'; c.fillRect(x - 2, 71, 4, 4);
        if (done) c.restore();
        break;
      case 'chest':
        c.fillStyle = woodD; c.fillRect(x - 17, F - 22, 34, 22);
        c.fillStyle = wood; c.fillRect(x - 16, F - 21, 32, 20);
        c.fillStyle = '#3a3a3e'; c.fillRect(x - 12, F - 22, 3, 22); c.fillRect(x + 9, F - 22, 3, 22);
        if (done) {
          c.fillStyle = woodD; c.fillRect(x - 17, F - 36, 34, 3); c.fillStyle = wood; c.fillRect(x - 16, F - 34, 32, 12);
          c.fillStyle = '#140e0a'; c.fillRect(x - 15, F - 22, 30, 3);
        } else {
          c.fillStyle = woodL; c.fillRect(x - 17, F - 26, 34, 5); c.fillStyle = '#3a3a3e'; c.fillRect(x - 12, F - 26, 3, 5); c.fillRect(x + 9, F - 26, 3, 5);
          c.fillStyle = '#b09050'; c.fillRect(x - 2, F - 21, 4, 4);
        }
        break;
      case 'bed':
        c.fillStyle = woodD; c.fillRect(x - 36, F - 40, 6, 40); c.fillRect(x + 30, F - 26, 6, 26);
        c.fillStyle = wood; c.fillRect(x - 36, F - 40, 6, 3);
        c.fillStyle = woodD; c.fillRect(x - 32, F - 16, 64, 10);
        c.fillStyle = '#d8d0c0'; c.fillRect(x - 30, F - 22, 60, 6);
        c.fillStyle = '#e8e2d4'; c.fillRect(x - 30, F - 26, 12, 5);
        c.fillStyle = theme === 'keep' ? '#5a2a2a' : theme === 'assize' ? '#2e3e5a' : '#6a5a3a'; c.fillRect(x - 16, F - 23, 46, 8);
        c.fillStyle = 'rgba(255,255,255,0.15)'; c.fillRect(x - 16, F - 23, 46, 1);
        break;
      case 'wardrobe':
        c.fillStyle = woodD; c.fillRect(x - 18, F - 92, 36, 92);
        c.fillStyle = wood; c.fillRect(x - 16, F - 88, 15, 84); c.fillRect(x + 1, F - 88, 15, 84);
        c.fillStyle = woodL; c.fillRect(x - 18, F - 92, 36, 3);
        c.fillStyle = woodD; c.fillRect(x - 13, F - 80, 9, 30); c.fillRect(x + 4, F - 80, 9, 30); c.fillRect(x - 13, F - 42, 9, 30); c.fillRect(x + 4, F - 42, 9, 30);
        c.fillStyle = '#b09050'; c.fillRect(x - 3, F - 50, 2, 3); c.fillRect(x + 1, F - 50, 2, 3);
        if (sp.occupied) { c.fillStyle = '#140e0a'; c.fillRect(x - 1, F - 88, 2, 84); }
        break;
      case 'curtain': {
        const col = theme === 'assize' ? '#2a4a3a' : theme === 'keep' ? '#6a2424' : '#4a3a5a';
        c.fillStyle = '#2a2018'; c.fillRect(x - 16, 26, 32, 3);
        for (let i = -12; i < 12; i += 4) {
          c.fillStyle = shade(col, 0.8 + ((i + 12) % 8) * 0.05); c.fillRect(x + i, 29, 4, F - 29);
          c.fillStyle = shade(col, 1.25); c.fillRect(x + i, 29, 1, F - 29);
        }
        if (sp.occupied) { c.fillStyle = shade(col, 0.6); c.fillRect(x - 5, F - 60, 10, 58); c.fillStyle = '#271f1b'; c.fillRect(x - 3, F - 4, 6, 4); }
        break;
      }
      case 'candle':
        c.fillStyle = '#2a2420'; c.fillRect(x - 1, F - 44, 2, 44); c.fillRect(x - 5, F - 3, 10, 3); c.fillRect(x - 4, F - 46, 8, 2);
        c.fillStyle = '#e8e0c8'; c.fillRect(x - 1, F - 52, 3, 6);
        if (!sp.out) {
          const fl = Math.sin(tm * 13 + x) > 0 ? 1 : 0;
          c.fillStyle = '#ffd070'; c.fillRect(x, F - 57 - fl, 2, 4 + fl);
          c.fillStyle = '#fff4c0'; c.fillRect(x, F - 55, 1, 2);
        } else { c.fillStyle = 'rgba(200,200,200,0.3)'; c.fillRect(x + ((tm * 3) | 0) % 2, F - 58, 1, 5); }
        break;
      case 'fireplace': {
        c.fillStyle = '#4a4540'; c.fillRect(x - 30, F - 64, 60, 64);
        c.fillStyle = '#5e5850'; c.fillRect(x - 34, F - 68, 68, 6);
        c.fillStyle = '#16100c'; c.fillRect(x - 20, F - 44, 40, 44);
        for (let i = 0; i < 9; i++) {
          const fh = 8 + Math.abs(Math.sin(tm * 7 + i * 1.7)) * 14;
          c.fillStyle = i % 3 === 0 ? '#ffd070' : i % 3 === 1 ? '#f08a30' : '#c0441c';
          c.fillRect(x - 16 + i * 4, F - 6 - fh, 3, fh);
        }
        c.fillStyle = '#3a2416'; c.fillRect(x - 16, F - 7, 32, 5);
        break;
      }
      case 'bell': {
        // the servants' bells: one to a room upstairs, each on a spring, each wired
        // up through the ceiling to a pull in that room
        const ringing = sp.ringT && tm < sp.ringT;
        c.fillStyle = woodD; c.fillRect(x - 18, 80, 36, 14);
        c.fillStyle = wood; c.fillRect(x - 17, 81, 34, 12);
        c.fillStyle = woodL; c.fillRect(x - 17, 81, 34, 1);
        for (let i = 0; i < 5; i++) {
          const bx = x - 12 + i * 6, wob = ringing && i === 1 ? Math.round(Math.sin(tm * 40) * 2) : 0;
          c.fillStyle = '#3a3430'; c.fillRect(bx, 14, 1, 66);
          c.fillStyle = '#6a6460'; c.fillRect(bx, 94, 1, 3);
          c.fillStyle = '#b08a3e'; c.fillRect(bx - 2 + wob, 97, 5, 4); c.fillRect(bx - 1 + wob, 96, 3, 1);
          c.fillStyle = '#e0c070'; c.fillRect(bx - 1 + wob, 97, 1, 2);
          c.fillStyle = '#f4ead0'; c.fillRect(bx - 1, 86, 3, 3);
        }
        break;
      }
      case 'lectern':
        c.fillStyle = woodD; c.fillRect(x - 2, F - 38, 4, 38); c.fillRect(x - 9, F - 3, 18, 3);
        c.fillStyle = wood; c.fillRect(x - 11, F - 44, 22, 6);
        c.fillStyle = woodL; c.fillRect(x - 11, F - 44, 22, 1);
        c.fillStyle = '#e8e0c8'; c.fillRect(x - 10, F - 48, 9, 4); c.fillRect(x + 1, F - 48, 9, 4);
        c.fillStyle = '#8a7a5a'; c.fillRect(x, F - 48, 1, 4);
        c.fillStyle = '#6b2424'; c.fillRect(x - 1, F - 44, 2, 8);
        break;
      case 'balcony': {
        // tall glass doors onto the balcony, the rail and the night beyond
        c.fillStyle = '#2a1e16'; c.fillRect(x - 20, F - 110, 40, 110);
        c.fillStyle = '#16203a'; c.fillRect(x - 17, F - 106, 34, 104);
        const br = rng(x);
        for (let k = 0; k < 8; k++) { c.fillStyle = '#c8c6b8'; c.fillRect(x - 16 + ((br() * 32) | 0), F - 104 + ((br() * 50) | 0), 1, 1); }
        c.fillStyle = '#10141e';
        [[-17, 50, 9], [-8, 44, 7], [-1, 54, 10], [9, 47, 8]].forEach(([a, h, w2]) => c.fillRect(x + a, F - h, w2, h - 30));
        c.fillStyle = '#3a2a1e'; c.fillRect(x - 1, F - 106, 2, 104); c.fillRect(x - 17, F - 64, 34, 2);
        c.fillStyle = '#1a1a1e'; c.fillRect(x - 20, F - 32, 40, 2);
        for (let k = -18; k < 20; k += 5) c.fillRect(x + k, F - 30, 1, 28);
        break;
      }
      case 'knives':
        // a wooden knife rack on the wall; one gone once she takes it
        c.fillStyle = woodD; c.fillRect(x - 12, 98, 24, 7);
        c.fillStyle = woodL; c.fillRect(x - 12, 98, 24, 1);
        for (let i = 0; i < 3; i++) {
          if (done && i === 1) continue;
          const kx = x - 7 + i * 7;
          c.fillStyle = '#2a1c14'; c.fillRect(kx - 1, 93, 3, 5);
          c.fillStyle = '#b8c4cc'; c.fillRect(kx, 105, 2, 14 - i * 2);
          c.fillStyle = '#e8eef2'; c.fillRect(kx, 105, 1, 12 - i * 2);
        }
        break;
      case 'bigbell':
        // the abbey bell, for the belfry scene
        c.fillStyle = '#3a2a1e'; c.fillRect(x - 40, 20, 80, 8);
        c.fillStyle = '#6a4a26'; c.fillRect(x - 3, 28, 6, 8);
        c.fillStyle = '#8a6a2a'; c.fillRect(x - 14, 36, 28, 10); c.fillRect(x - 18, 46, 36, 18); c.fillRect(x - 24, 64, 48, 8);
        c.fillStyle = '#b08a3a'; c.fillRect(x - 12, 38, 4, 30);
        c.fillStyle = '#5a4018'; c.fillRect(x - 24, 70, 48, 2);
        c.fillStyle = '#8a7250'; c.fillRect(x + 20, 30, 2, 130);
        break;
      case 'strongbox':
        c.fillStyle = '#2a2a2e'; c.fillRect(x - 15, F - 24, 30, 24);
        c.fillStyle = '#44444c'; c.fillRect(x - 14, F - 23, 28, 22);
        c.fillStyle = '#5a5a64'; c.fillRect(x - 14, F - 23, 28, 2);
        c.fillStyle = '#2a2a2e'; for (let i = -12; i < 14; i += 6) c.fillRect(x + i, F - 21, 1, 1);
        if (done) { c.fillStyle = '#0c0c0e'; c.fillRect(x - 12, F - 20, 24, 6); }
        else { c.fillStyle = '#c9a13e'; c.fillRect(x - 3, F - 16, 6, 6); c.fillStyle = '#1a1a1a'; c.fillRect(x - 1, F - 14, 2, 3); }
        break;
      case 'rack':
        c.fillStyle = woodD; c.fillRect(x - 16, 108, 32, 8); c.fillStyle = woodL; c.fillRect(x - 16, 108, 32, 1);
        c.fillStyle = '#8a8a90';
        for (let i = -12; i < 14; i += 8) c.fillRect(x + i, 116, 1, 4);
        if (!done) {
          c.fillStyle = '#c9a13e'; c.fillRect(x - 4, 118, 3, 8); c.fillRect(x - 5, 124, 5, 3);
          c.fillStyle = '#9aa6b0'; c.fillRect(x + 4, 118, 1, 10); c.fillRect(x + 12, 118, 1, 10);
        }
        break;
      case 'barrel':
        c.fillStyle = woodD; c.fillRect(x - 11, F - 28, 22, 28);
        c.fillStyle = wood; c.fillRect(x - 10, F - 27, 20, 26);
        c.fillStyle = woodL; c.fillRect(x - 6, F - 27, 3, 26);
        c.fillStyle = '#3a3a3e'; c.fillRect(x - 11, F - 23, 22, 2); c.fillRect(x - 11, F - 8, 22, 2);
        if (done) { c.fillStyle = '#1a120c'; c.fillRect(x - 9, F - 28, 18, 2); }
        break;
      case 'table':
        c.fillStyle = woodD; c.fillRect(x - 22, F - 24, 3, 24); c.fillRect(x + 19, F - 24, 3, 24);
        c.fillStyle = wood; c.fillRect(x - 26, F - 28, 52, 5); c.fillStyle = woodL; c.fillRect(x - 26, F - 28, 52, 1);
        if (!done) {
          c.fillStyle = '#c89a50'; c.fillRect(x - 14, F - 33, 12, 5); c.fillStyle = '#e0b870'; c.fillRect(x - 13, F - 34, 10, 1);
          c.fillStyle = '#6a6a74'; c.fillRect(x + 6, F - 36, 6, 8); c.fillStyle = '#8a8a94'; c.fillRect(x + 6, F - 36, 6, 1);
        } else { c.fillStyle = '#c89a50'; c.fillRect(x - 12, F - 30, 3, 2); }
        break;
      case 'altar':
        c.fillStyle = '#6a6458'; c.fillRect(x - 26, F - 36, 52, 36);
        c.fillStyle = '#86806e'; c.fillRect(x - 28, F - 38, 56, 4);
        c.fillStyle = '#e2dac8'; c.fillRect(x - 20, F - 34, 40, 20); c.fillStyle = '#c9a13e'; c.fillRect(x - 20, F - 16, 40, 2);
        c.fillStyle = '#6b2a2a'; c.fillRect(x - 2, F - 34, 4, 18);
        if (!done) { c.fillStyle = '#d8d0b8'; c.fillRect(x + 8, F - 42, 10, 4); c.fillStyle = '#a02a2a'; c.fillRect(x + 12, F - 41, 2, 2); }
        break;
      case 'cabinet':
        c.fillStyle = woodD; c.fillRect(x - 17, F - 60, 34, 60);
        c.fillStyle = wood; c.fillRect(x - 15, F - 56, 14, 52); c.fillRect(x + 1, F - 56, 14, 52);
        c.fillStyle = woodL; c.fillRect(x - 17, F - 60, 34, 2);
        c.fillStyle = '#b09050'; c.fillRect(x - 3, F - 32, 2, 3); c.fillRect(x + 1, F - 32, 2, 3);
        if (done && !sp.occupied) { c.fillStyle = '#140e0a'; c.fillRect(x + 1, F - 56, 14, 52); c.fillStyle = wood; c.fillRect(x + 15, F - 56, 6, 52); }
        if (sp.occupied) { c.fillStyle = '#140e0a'; c.fillRect(x - 1, F - 56, 3, 52); }
        // crockery on top
        c.fillStyle = '#c8c0b0'; c.fillRect(x - 12, F - 66, 6, 6); c.fillRect(x + 4, F - 64, 8, 4);
        break;
    }
    void dark;
  }

  function load() {
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return s && s.v === 1 ? s : null; } catch (e) { return null; }
  }
  function persist(snap) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(snap)); } catch (e) { /* private window: play on unsaved */ }
  }
  // ---------- cards ----------
  const card = $('card');
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function showCard(o) {
    S.cardUp = true;
    card.hidden = false;
    card.querySelector('h2').textContent = o.title;
    card.querySelector('.card-body').innerHTML = o.body || '';
    card.classList.toggle('high', !!o.portrait);
    card.classList.toggle('low', !!o.low);
    const box = card.querySelector('.card-actions');
    box.innerHTML = '';
    (o.actions || []).forEach((a, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'choice' + (a.cls ? ' ' + a.cls : '');
      b.innerHTML = '<span>' + esc(a.label) + '</span>' + (a.sub ? '<small>' + esc(a.sub) + '</small>' : '');
      b.disabled = !!a.disabled;
      b.addEventListener('click', () => { if (!b.disabled) { sfx('click'); a.fn(); } });
      box.appendChild(b);
      if (i === 0) setTimeout(() => { try { b.focus({ preventScroll: true }); } catch (e) { /* ok */ } }, 30);
    });
  }
  function hideCard() { S.cardUp = false; card.hidden = true; }

  // ---------- toasts and HUD ----------
  function sayLine(text, secs) {
    const el = $('say');
    if (el) { el.textContent = text; el.classList.add('on'); clearTimeout(sayLine.h); sayLine.h = setTimeout(() => el.classList.remove('on'), secs * 1000); }
  }

  function heart(c, x, y, full) {
    const px = [[1, 0], [2, 0], [4, 0], [5, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [2, 4], [3, 4], [4, 4], [3, 5]];
    c.fillStyle = '#120c0a';
    for (const [a, b] of px) c.fillRect(x + a * 2 + 1, y + b * 2 + 1, 2, 2);
    for (const [a, b] of px) { c.fillStyle = full ? (b === 1 && a < 3 ? '#f07a6a' : '#b8302a') : '#3a2a28'; c.fillRect(x + a * 2, y + b * 2, 2, 2); }
  }
  function coin(c, x, y) {
    c.fillStyle = '#120c0a'; c.fillRect(x + 1, y + 1, 8, 8);
    c.fillStyle = '#c9c6bc'; c.fillRect(x, y + 1, 8, 6); c.fillRect(x + 1, y, 6, 8);
    c.fillStyle = '#f0ede4'; c.fillRect(x + 1, y + 1, 3, 2);
    c.fillStyle = '#8a8880'; c.fillRect(x + 3, y + 3, 2, 3);
  }

  // pebble, dart, lockpick: 10x10 each
  function invIcon(c, k, x, y) {
    const px = (a, b, w, h, col) => { c.fillStyle = col; c.fillRect(x + a, y + b, w, h); };
    if (k === 'pebbles') {
      px(1, 3, 8, 6, '#120c0a'); px(1, 2, 7, 6, '#8a8478'); px(2, 1, 5, 1, '#8a8478'); px(2, 2, 3, 2, '#c8c2b4'); px(5, 6, 3, 1, '#5e594f');
    } else if (k === 'knife') {
      for (let i = 0; i < 6; i++) { px(3 + i, 7 - i, 2, 2, '#120c0a'); px(3 + i, 6 - i, 1, 1, '#d8e0e6'); px(4 + i, 6 - i, 1, 1, '#98a4ac'); }
      px(0, 7, 4, 2, '#5a3a24'); px(1, 6, 2, 1, '#c9a13e');
    } else if (k === 'darts') {
      for (let i = 0; i < 7; i++) { px(1 + i, 8 - i, 2, 2, '#120c0a'); px(1 + i, 7 - i, 1, 1, '#b8c4cc'); }
      px(0, 7, 3, 3, '#6aa060'); px(1, 8, 1, 1, '#3e6a3a');
    } else {
      px(1, 1, 5, 5, '#120c0a'); px(0, 0, 5, 5, '#c9a13e'); px(1, 1, 3, 3, '#120c0a'); px(1, 1, 1, 1, '#f0d890');
      for (let i = 0; i < 5; i++) px(4 + i, 4 + i, 2, 1, '#c9a13e');
      px(8, 7, 1, 3, '#c9a13e');
    }
  }

  function drawHud(c) {
    if (S.noHud || (S.mode !== 'ext' && S.mode !== 'room')) return;
    // a strip across the top, the way the old phones framed their games
    c.fillStyle = 'rgba(10,8,7,0.72)'; c.fillRect(0, 0, VW, 18);
    c.fillStyle = 'rgba(200,180,140,0.25)'; c.fillRect(0, 18, VW, 1);
    for (let i = 0; i < MAX_HEARTS; i++) heart(c, 5 + i * 17, 4, i < S.run.hearts);
    coin(c, 60, 4); drawText(c, String(S.run.silver), 72, 5, '#e8e2cc', 2);
    let x = 108;
    const inv = S.run.inv;
    for (const k of ['pebbles', 'darts', 'picks']) {
      invIcon(c, k, x, 4);
      drawText(c, String(inv[k]), x + 12, 5, '#e8e2cc', 2);
      x += 12 + textWidth(String(inv[k]), 2) + 9;
    }
    if (S.run.knife) invIcon(c, 'knife', x, 4);
    // the objective, top right
    const L = LEVELS[S.li];
    // context prompt
    const pr = promptText();
    if (pr) {
      // in a room the bottom middle is the way out, so the prompt goes up under the HUD
      const wdt = textWidth(pr, 2) + 12, py = S.mode === 'room' ? 22 : VH - 22;
      c.fillStyle = 'rgba(10,8,7,0.8)'; c.fillRect(Math.round(VW / 2 - wdt / 2), py, wdt, 17);
      c.fillStyle = 'rgba(224,200,144,0.5)'; c.fillRect(Math.round(VW / 2 - wdt / 2), py + 16, wdt, 1);
      drawText(c, pr, VW / 2, py + 5, '#f0e2c0', 2, 'center');
    }
  }

  function promptText() {
    if (S.mode === 'ext') {
      const P = S.player;
      if (P.anim || S.trans) return '';
      const td = takedownTarget();
      if (td) return td.kind === 'ledge' ? 'Q: pull him off the ledge' : (S.run.knife ? 'E: choke out   Q: kill' : 'E: choke out');
      if (P.m === 's') {
        const d = decoAt(S.world, P.x, P.y);
        if (d === 'T') return 'Up: go in to ' + LEVELS[S.li].target.split(' ')[0].toLowerCase() + ' ' + LEVELS[S.li].target.split(' ').slice(1).join(' ').toLowerCase();
        if (d && '123456789'.includes(d)) {
          const rs = S.lv.rooms[d];
          const locked = LEVELS[S.li].rooms[d].locked && !(rs && rs.unlocked);
          return locked ? 'Up: pick the shutter lock' : 'Up: climb in the window';
        }
        if (d === 'S') return 'Behind the banner';
      }
      return '';
    }
    if (S.mode === 'room') {
      const R = S.room;
      if (!R || R.caught > 0) return '';
      if (R.act) return 'Searching...';
      if (R.aim) {
        const t = aimTargets()[R.aim.i];
        const name = t ? (t.def ? WHO[t.kind] || 'them' : 'the ' + LABEL[t.kind].toLowerCase()) : '';
        if (R.aim.kind === 'pebbles' && t) {
          const n = pebbleListeners(t).length;
          return 'E: throw at ' + name + (n ? '  - ' + n + ' will look' : '  - nobody hears');
        }
        return 'E: dart ' + name + '  < >';
      }
      const p = roomTakedownTarget();
      if (p && TARGET[p.kind]) { if (S.run.knife) return 'Q: do it yourself'; }
      else if (p) return S.run.knife ? 'E: knock out   Q: kill' : 'E: knock out';
      if (R.peek) return 'Arrows: climb in   Down: back out';
      if (R.climbIn > 0) return '';
      if (R.hidden) return 'Hidden. Move to step out';
      const sp = !R.path && nearestSpot();
      if (sp) {
        const v = SPOT[sp.kind].verb, n = LABEL[sp.kind].toLowerCase();
        const mm = methodOf(sp);
        if (mm && knownM(mm)) { const miss = missingFor(mm); return miss.length ? 'Needs ' + miss.map(itemName).join(', ') : 'E: ' + mm.verb; }
        if (v === 'exit') return R.id === 'T' ? 'E: climb out and leave ' + LEVELS[S.li].pron + ' be' : 'E: climb out of the window';
        if (v === 'hide') return 'E or Up: hide in the ' + n;
        if (HIDEABLE[sp.kind]) return sp.done ? 'E or Up: hide in the ' + n : 'E: search   Up: hide';
        if (v === 'snuff') return sp.out ? 'E: light the candle' : 'E: snuff the candle';
        if (v === 'bell') return "E: ring a bell upstairs";
        if (v === 'search') return sp.done ? '' : (sp.needs && !has(sp.needs) ? 'Locked' : 'E: search the ' + n);
      }
      return '';
    }
    return '';
  }

  // ---------- drawing outside ----------
  function clampCam() {
    const A = art[S.li];
    S.cam.x = Math.max(-A.ox, Math.min(A.W - A.ox - VW, S.cam.x));
    S.cam.y = Math.max(-A.oy, Math.min(A.H - A.oy - VH, S.cam.y));
  }

  function drawExt(c) {
    const A = art[S.li], w = S.world, P = S.player;
    const cx = Math.round(S.cam.x), cy = Math.round(S.cam.y);
    drawTown(c, A, cx, cy);
    // the lit room windows breathe a little, so the eye finds them
    for (const id in w.windows) {
      const q = w.windows[id], X = q.x * T + 8 - cx, Y = q.y * T - 2 - cy;
      if (X < -40 || X > VW + 40 || Y < -40 || Y > VH + 40) continue;
      const locked = LEVELS[S.li].rooms[id] && LEVELS[S.li].rooms[id].locked && !(S.lv.rooms[id] && S.lv.rooms[id].unlocked);
      if (locked) continue;
      const fl = 0.16 + Math.sin(S.t * 3 + q.x) * 0.03 + Math.sin(S.t * 11.3 + q.y) * 0.015;
      const g = c.createRadialGradient(X, Y, 2, X, Y, 30);
      g.addColorStop(0, id === 'T' ? 'rgba(255,150,80,' + (fl + 0.08) + ')' : 'rgba(255,190,100,' + fl + ')');
      g.addColorStop(1, 'rgba(255,170,90,0)');
      c.fillStyle = g; c.fillRect(X - 30, Y - 30, 60, 60);
    }
    c.drawImage(A.fg, cx, cy + A.oy, VW, VH, 0, 0, VW, VH);
    // lanterns on their iron arms
    for (const tq of w.torches) {
      const X = tq.x * T + 9 - cx, Y = tq.y * T + 8 - cy;
      if (X < -60 || X > VW + 60 || Y < -60 || Y > VH + 60) continue;
      const fl = Math.sin(S.t * 17 + tq.x) * 0.5 + Math.sin(S.t * 7 + tq.y);
      const g = c.createRadialGradient(X, Y, 1, X, Y, 40 + fl * 2);
      g.addColorStop(0, 'rgba(255,180,90,0.32)'); g.addColorStop(1, 'rgba(255,150,60,0)');
      c.fillStyle = g; c.fillRect(X - 44, Y - 44, 88, 88);
      c.fillStyle = '#16120f'; c.fillRect(X - 3, Y - 6, 7, 10); c.fillRect(X - 2, Y - 8, 5, 2);
      c.fillStyle = fl > 0.6 ? '#ffd27a' : '#f0b050'; c.fillRect(X - 2, Y - 5, 5, 7);
      c.fillStyle = '#16120f'; c.fillRect(X, Y - 5, 1, 7);
      c.fillStyle = '#fff0b0'; c.fillRect(X, Y - 2 - (fl > 0 ? 1 : 0), 1, 2);
    }
    // the climbable ivy sheds a leaf every few seconds, which blows off on the wind:
    // enough movement to catch the eye and say "this one is different"
    for (let y = Math.floor(cy / T) - 1; y <= Math.floor((cy + VH) / T) + 1; y++) {
      for (let x = Math.floor(cx / T) - 1; x <= Math.floor((cx + VW) / T) + 1; x++) {
        if (!ivyAt(w, x, y)) continue;
        const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
        if (h % 3) continue;
        const period = 3 + (h % 7) * 0.4, ph = (S.t + (h % 100) / 10) % period;
        if (ph > 2.2) continue;
        const X = x * T + 4 + (h % 8) - cx + ph * 16 + Math.sin(ph * 5 + h) * 3, Y = y * T + 6 - cy + ph * 10 + ph * ph * 3;
        c.globalAlpha = Math.max(0, 1 - ph / 2.2);
        c.fillStyle = Math.floor(ph * 6) % 2 ? '#7e9a45' : '#5f7d35';
        c.fillRect(Math.round(X), Math.round(Y), 2, Math.floor(ph * 6) % 2 ? 1 : 2);
        c.globalAlpha = 1;
      }
    }
    for (const g of S.guards) drawGuard(c, g, cx, cy);
    // the thief
    drawThief(c, cx, cy);
    drawBanners(c, cx, cy);
    // motes of dust drifting in the lamplight
    const r = rng(7);
    for (let i = 0; i < 26; i++) {
      const bx = r() * VW, by = r() * VH, sp = 4 + r() * 8;
      const x = (bx + S.t * sp * (r() < 0.5 ? 1 : -0.6)) % VW, y = (by + Math.sin(S.t * 0.7 + i) * 6 + S.t * 2) % VH;
      c.fillStyle = 'rgba(230,220,190,' + (0.12 + r() * 0.18) + ')'; c.fillRect((x + VW) % VW, (y + VH) % VH, 1, 1);
    }
    void P;
  }

  // Heavy banners on iron poles: step behind one and the guards walk past. Drawn in
  // front of her, so behind one only her boots show. Each house flies its own.
  const BANNER = {
    abbey: { cloth: '#6b2424', dark: '#4a1818', gold: '#c9a13e' },
    assize: { cloth: '#26365a', dark: '#18233c', gold: '#c9a13e' },
    keep: { cloth: '#2d4a32', dark: '#1d3222', gold: '#c9a13e' },
  };
  function drawBanners(c, cx, cy) {
    const w = S.world, col = BANNER[LEVELS[S.li].id], P = S.player;
    for (let y = Math.floor(cy / T); y <= Math.floor((cy + VH) / T) + 1; y++) {
      for (let x = Math.floor(cx / T); x <= Math.floor((cx + VW) / T); x++) {
        if (decoAt(w, x, y) !== 'S') continue;
        const X = x * T - cx, Y = y * T - cy;
        const behind = P.state === 'ground' && P.x === x && P.y === y;
        if (at(w, x, y) === 'R') { drawChimney(c, X, Y + T, x, behind); continue; }
        // a banner hangs from an iron arm on a wall; out in the open, from a standard planted in the ledge
        c.fillStyle = '#1e1a18'; c.fillRect(X, Y - 16, T, 2);
        c.fillStyle = '#5a5450'; c.fillRect(X, Y - 16, T, 1);
        const home = houseAt(LEVELS[S.li], x);
        if (!home || y < home[2]) {
          c.fillStyle = '#1e1a18'; c.fillRect(X + T - 2, Y - 20, 2, 36);
          c.fillStyle = '#c9a13e'; c.fillRect(X + T - 3, Y - 22, 4, 2);
        }
        const swing = (behind ? 1.6 : 0.6) * Math.sin(S.t * 1.7 + x);
        for (let i = 0; i < 12; i++) {
          const top = Y - 15, len = 24 + (i % 3 === 1 ? 1 : 0);
          for (let j = 0; j < len; j++) {
            const off = Math.round(swing * (j / len));
            const fold = i % 4 === 0 ? col.dark : i % 4 === 3 ? shade(col.cloth, 1.15) : col.cloth;
            c.fillStyle = fold;
            c.fillRect(Math.round(X + 2 + i + off), Math.round(top + j), 1, 1);
          }
        }
        // the device on each, and a gold fringe along the hem
        const mx = Math.round(X + 8 + swing * 0.5), my = Math.round(Y - 6);
        c.fillStyle = col.gold;
        if (LEVELS[S.li].id === 'abbey') { c.fillRect(mx - 1, my - 4, 2, 9); c.fillRect(mx - 3, my - 2, 6, 2); }
        else if (LEVELS[S.li].id === 'assize') { c.fillRect(mx - 4, my - 2, 8, 1); c.fillRect(mx - 1, my - 4, 1, 8); c.fillRect(mx - 4, my - 1, 2, 2); c.fillRect(mx + 2, my - 1, 2, 2); }
        else { c.fillRect(mx, my - 4, 1, 9); for (let k = 0; k < 3; k++) { c.fillRect(mx - 2, my - 3 + k * 2, 2, 1); c.fillRect(mx + 1, my - 2 + k * 2, 2, 1); } }
        for (let i = 0; i < 12; i += 2) { c.fillStyle = col.gold; c.fillRect(Math.round(X + 2 + i + swing), Math.round(Y + 10), 1, 2); }
        c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(Math.round(X + 2 + swing), Math.round(Y + 12), 12, 1);
      }
    }
  }

  // A chimney stack on a roof: step behind it and only her boots show. (X, Y) is
  // the roof line at its foot.
  function drawChimney(c, X, Y, x, behind) {
    const st = LEVELS[S.li].art.stone;
    c.fillStyle = '#121014'; c.fillRect(X + 1, Y - 31, 15, 31);
    for (let r = 0; r < 7; r++) for (let k = 0; k < 2; k++) {
      const bx = X + 2 + k * 7 - (r % 2) * 3, by = Y - 30 + r * 4;
      const l = 0.55 + ((x * 7 + r * 3 + k) % 5) * 0.06;
      c.fillStyle = rgb(st[0] * l, st[1] * l, st[2] * l * 1.05);
      c.fillRect(Math.max(X + 2, bx), by, Math.min(6, X + 15 - Math.max(X + 2, bx)), 3);
    }
    c.fillStyle = rgb(st[0] * 0.8, st[1] * 0.8, st[2] * 0.85); c.fillRect(X, Y - 34, 17, 4);
    c.fillStyle = NIGHT.hold; c.fillRect(X, Y - 34, 17, 1);
    c.fillStyle = '#121014'; c.fillRect(X + 4, Y - 38, 4, 4); c.fillRect(X + 10, Y - 37, 4, 3);
    // smoke, drifting off downwind
    for (let i = 0; i < 6; i++) {
      const ph = (S.t * 0.35 + i / 6 + x * 0.13) % 1;
      c.fillStyle = 'rgba(150,155,175,' + (0.22 * (1 - ph)) + ')';
      const sx = X + 6 + ph * 22 + Math.sin(ph * 6 + i) * 2, sy = Y - 40 - ph * 26;
      c.fillRect(Math.round(sx), Math.round(sy), 3 + Math.round(ph * 5), 2 + Math.round(ph * 3));
    }
    if (behind) { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(X + 1, Y - 31, 15, 31); }
  }

  function drawThief(c, cx, cy) {
    const P = S.player;
    let pose = 'idle', ph = S.t * 0.6, back = false;
    if (P.busy > 0) pose = P.pose || 'crouch';
    else if (P.anim) {
      const k = P.anim.t / P.anim.dur;
      switch (P.anim.kind) {
        case 'mantle': pose = k < 0.45 ? 'hang' : 'crouch'; back = k < 0.45; break;
        case 'hangdown': pose = k < 0.4 ? 'crouch' : 'hang'; back = k >= 0.4; break;
        case 'handup': case 'handdown': pose = 'climb'; ph = k * 0.5; back = true; break;
        case 'step': pose = 'walk'; ph = k * 0.5; break;
      }
    } else if (P.state === 'ground') {
      if (Math.abs(P.vx) > MV.run + 8) { pose = 'sprint'; ph = (P.dist || 0) / 34; }
      else if (Math.abs(P.vx) > 8) { pose = 'walk'; ph = (P.dist || 0) / 26; }
    }
    else if (P.state === 'air') pose = P.vy < 60 ? 'jump' : 'fall';
    else if (P.state === 'hang') { pose = 'hang'; back = true; }
    else if (P.state === 'climb') { pose = 'climb'; ph = (P.cph || 0) * 1.3; back = true; }
    if (P.hurtT > 0 && Math.floor(S.t * 20) % 2) return;
    const hidden = P.state === 'ground' && !P.anim && decoAt(S.world, P.x, P.y) === 'S';
    const x = P.px - cx, y = P.py - cy;
    if (P.state === 'ground' && !P.anim) { c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(Math.round(x - 5), Math.round(y - 1), 10, 2); }
    c.save();
    if (hidden) c.globalAlpha = 0.85;
    drawFigure(c, 'wren', poseFor(pose, ph), x, y, 1, P.f, { back, blades: S.run.knife });
    c.restore();
  }

  function drawGuard(c, g, cx, cy) {
    const X = (g.x + 0.5) * T - cx, Y = (g.fy != null ? g.fy : (g.y + 1) * T) - cy;
    if (X < -30 || X > VW + 30 || Y < -40 || Y > VH + 40) return;
    const look = 'guard';
    const saved = LOOKS.guard.torso, savedL = LOOKS.guard.torsoL;
    LOOKS.guard.torso = LEVELS[S.li].art.tabard; LOOKS.guard.torsoL = shade(LEVELS[S.li].art.tabard, 1.3);
    if (g.state === 'dead' || g.state === 'ko') {
      drawFigure(c, look, P0.lie, X, Y, 1, g.f, { lying: true });
      if (g.state === 'dead') { c.fillStyle = '#6a1414'; c.fillRect(Math.round(X - 3), Math.round(Y - 1), 7, 1); }
      else drawText(c, 'Z', X + 6 * g.f, Y - 12 - (Math.floor(S.t * 2) % 2) * 2, '#c8c0e0', 1);
    } else if (g.state === 'falling') {
      drawFigure(c, look, P0.fall, X, Y, 1, g.f);
    } else {
      // his line of sight, faintly, along the row
      const range = (SIGHT + (S.lv.alarms > 0 ? 1 : 0) + (g.state === 'alert' ? 2 : 0)) * T;
      const gr = c.createLinearGradient(X, 0, X + g.f * range, 0);
      const col = g.state === 'alert' ? '220,60,40' : g.sus > 0.3 ? '240,200,80' : '240,220,160';
      gr.addColorStop(0, 'rgba(' + col + ',' + (0.12 + g.sus * 0.1) + ')'); gr.addColorStop(1, 'rgba(' + col + ',0)');
      c.fillStyle = gr;
      const x0 = g.f > 0 ? X + 3 : X - range - 3;
      c.fillRect(Math.round(x0), Math.round(Y - 26), range, 24);
      const moving = g.state === 'patrol' && g.pause <= 0 || g.state === 'alert' && sees(g) !== false && Math.abs(S.player.px / T - 0.5 - g.x) > 0.9;
      const pose = g.swing ? P0.point : moving ? walkPose(g.walked * 0.55, 3) : poseFor('idle', S.t * 0.5 + g.id);
      drawFigure(c, look, pose, X, Y, 1, g.f);
      // a spear
      c.fillStyle = '#4a3322'; c.fillRect(Math.round(X - 4 * g.f), Math.round(Y - 30), 1, 28);
      c.fillStyle = '#b8c0c8'; c.fillRect(Math.round(X - 4 * g.f), Math.round(Y - 34), 1, 4);
      if (g.sus > 0.05 || g.state === 'alert') {
        const mark = g.state === 'alert' ? '!' : '?';
        const col2 = g.state === 'alert' ? '#ff5a3a' : '#f0d060';
        drawText(c, mark, X, Y - 42, col2, 2, 'center');
        if (g.state !== 'alert') { c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(Math.round(X - 6), Math.round(Y - 46), 12, 2); c.fillStyle = col2; c.fillRect(Math.round(X - 6), Math.round(Y - 46), Math.round(12 * Math.min(1, g.sus)), 2); }
      }
    }
    LOOKS.guard.torso = saved; LOOKS.guard.torsoL = savedL;
  }

  // ---------- drawing a room ----------
  // Furniture and people are painted at their natural size into a scratch
  // canvas, then stamped into the room at their depth's scale with no
  // smoothing, so the pixels stay square however far back they stand.
  const sprC = mk(120, 200), sprX = sprC.getContext('2d');
  function blitSpot(c, sp, theme) {
    sprX.clearRect(0, 0, 120, 200);
    drawSpot(sprX, Object.assign({}, sp, { x: 60 }), S.t, theme);
    const p = proj(sp.u, sp.v), k = p.k;
    c.drawImage(sprC, 0, 0, 120, 200, Math.round(p.x - 60 * k), Math.round(p.y - FLOOR * k), Math.round(120 * k), Math.round(200 * k));
  }
  const figC = mk(90, 96), figX = figC.getContext('2d');
  function blitFigure(c, look, pose, u, v, f, opts, lift) {
    figX.clearRect(0, 0, 90, 96);
    drawFigure(figX, look, pose, 45, 90, 2, f, opts);
    const p = proj(u, v, lift || 0), k = p.k;
    c.drawImage(figC, 0, 0, 90, 96, Math.round(p.x - 45 * k), Math.round(p.y - 90 * k), Math.round(90 * k), Math.round(96 * k));
    return p;
  }

  // the top of a thing, for labels and brackets: [x, y, half-width, height]
  function spotBox(sp) {
    if (sp.kind === 'window') {
      const a = proj(SILL.u, V_MAX, 62);
      return [a.x, a.y, 14 * a.k, 62 * a.k];
    }
    const m = SPOT[sp.kind], p = proj(sp.u, sp.v);
    return [p.x, p.y - (FLOOR - m.top) * p.k, m.hw * p.k, ((m.bot || FLOOR) - m.top) * p.k];
  }
  function personBox(p) {
    const lying = down(p) || p.state === 'sleep';
    const q = proj(p.u, p.v, p.onBed ? 20 : 0);
    return lying ? [q.x, q.y - 14 * q.k, 26 * q.k, 14 * q.k] : [q.x, q.y - 56 * q.k, 9 * q.k, 56 * q.k];
  }
  function brackets(c, box, col) {
    const [x, y, hw, h] = box, x0 = Math.round(x - hw - 3), x1 = Math.round(x + hw + 3), y0 = Math.round(y - 3), y1 = Math.round(y + h + 2);
    c.fillStyle = col;
    for (const [bx, by, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
      c.fillRect(Math.min(bx, bx + sx * 5), by, 6, 1);
      c.fillRect(bx, Math.min(by, by + sy * 5), 1, 6);
    }
  }

  function drawPerson(c, p) {
    if (down(p) || p.state === 'sleep') {
      const q = blitFigure(c, p.kind, P0.lie, p.u, p.v, p.f, { lying: true }, p.onBed ? 20 : 0);
      if (p.state === 'dead') { c.fillStyle = '#6a1414'; c.fillRect(Math.round(q.x - 8 * q.k), Math.round(q.y - 1), Math.round(26 * q.k), 2); }
      drawText(c, 'Z', q.x + 16 * q.k, q.y - 24 * q.k - (Math.floor(S.t * 2) % 2) * 3, '#c8c0e0', 2);
      if (p.state === 'sleep' && p.stir > 0.05) {
        const bx = Math.round(q.x - 12), by = Math.round(q.y - 34 * q.k);
        c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(bx, by, 24, 3);
        c.fillStyle = '#f0d060'; c.fillRect(bx, by, Math.round(24 * Math.min(1, p.stir)), 3);
      }
      return;
    }
    let pose = p.moving ? walkPose(p.ph, 3) : poseFor('idle', S.t * 0.4 + p.home * 10), opts = null;
    const busy = p.state === 'routine' && p.act && !p.wp;
    if (busy) { const a = actPose(p.act, S.t + p.home * 7); pose = a.pose; opts = a.opts; }
    const q = blitFigure(c, p.kind, pose, p.u, p.v, p.f, opts);
    if (busy && p.act === 'write') {
      // the back of the chair at the desk
      c.fillStyle = '#3a2416'; c.fillRect(Math.round(q.x - 8 * q.k), Math.round(q.y - 20 * q.k), Math.round(16 * q.k), Math.round(3 * q.k));
      c.fillRect(Math.round(q.x - 7 * q.k), Math.round(q.y - 18 * q.k), Math.round(2 * q.k), Math.round(18 * q.k));
      c.fillRect(Math.round(q.x + 5 * q.k), Math.round(q.y - 18 * q.k), Math.round(2 * q.k), Math.round(18 * q.k));
      c.fillStyle = '#5a3a24'; c.fillRect(Math.round(q.x - 6 * q.k), Math.round(q.y - 14 * q.k), Math.round(12 * q.k), Math.round(4 * q.k));
    }
    if (p.meter > 0.02 || p.said) {
      const alert = p.meter >= 1, col = alert ? '#ff5a3a' : '#f0d060';
      const top = q.y - 62 * q.k;
      drawText(c, alert ? '!' : '?', q.x, top - 16, col, 3, 'center');
      if (!alert) {
        c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(Math.round(q.x - 12), Math.round(top - 22), 24, 3);
        c.fillStyle = col; c.fillRect(Math.round(q.x - 12), Math.round(top - 22), Math.round(24 * p.meter), 3);
      }
    }
  }

  function drawRoom(c) {
    const R = S.room;
    c.drawImage(roomBg(R.theme), 0, 0);
    const lights = [];
    for (const sp of R.spots) {
      if (sp.kind === 'candle' && !sp.out) { const q = proj(sp.u, sp.v, 54); lights.push([q.x, q.y, 90 * q.k]); }
      if (sp.kind === 'fireplace') { const q = proj(sp.u, sp.v, 20); lights.push([q.x, q.y, 110 * q.k]); }
    }
    for (const sp of R.spots) if (sp.wall && sp.kind !== 'window') blitSpot(c, sp, R.theme);
    if (R.people.some((p) => (p.state === 'leaving' || p.state === 'return') && p.u > 0.88 && p.wp)) {
      // the door stands open while someone goes through it
      const a = proj(1, DOOR.v0 + 0.012, DOOR.h1 - 2), b = proj(1, DOOR.v1 - 0.012, DOOR.h1 - 2), d = proj(1, DOOR.v1 - 0.012), e = proj(1, DOOR.v0 + 0.012);
      c.fillStyle = '#100b08';
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(d.x, d.y); c.lineTo(e.x, e.y); c.closePath(); c.fill();
    }
    for (const [x, y, rad] of lights) {
      const g = c.createRadialGradient(x, y, 2, x, y, rad);
      g.addColorStop(0, 'rgba(255,190,110,0.2)'); g.addColorStop(1, 'rgba(255,170,90,0)');
      c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // sight cones, laid on the floor
    c.save();
    const f0 = proj(0, 0), f1 = proj(1, 0), f2 = proj(1, 1.4), f3 = proj(0, 1.4);
    c.beginPath(); c.moveTo(f0.x, f0.y); c.lineTo(f1.x, f1.y); c.lineTo(f2.x, f2.y); c.lineTo(f3.x, f3.y); c.closePath(); c.clip();
    for (const p of R.people) {
      if (down(p) || p.state === 'sleep' || p.state === 'away') continue;
      const sv = sightOf(p);
      if (sv.away) continue;   // busy with their back to the room: no cone
      const sight = sv.range;
      const du = p.f * sight / FX, dvv = (sight * 0.75 + 14) / FY;
      const a = proj(p.u, p.v), b = proj(p.u + du, Math.max(0, p.v - dvv)), d = proj(p.u + du, p.v + dvv);
      const g = c.createLinearGradient(a.x, 0, b.x, 0);
      const col = p.meter > 0.5 ? '230,80,50' : '240,220,150';
      g.addColorStop(0, 'rgba(' + col + ',' + (0.16 + p.meter * 0.14) + ')'); g.addColorStop(1, 'rgba(' + col + ',0)');
      c.fillStyle = g;
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(d.x, d.y); c.closePath(); c.fill();
    }
    c.restore();
    // everything standing on the floor, back to front
    const items = [];
    for (const sp of R.spots) if (!sp.wall) items.push({ v: sp.v, draw: () => blitSpot(c, sp, R.theme) });
    for (const p of R.people) if (p.state !== 'away' && p.u < 0.99) items.push({ v: p.v + (p.onBed ? 0.002 : 0), draw: () => drawPerson(c, p) });
    if (!R.hidden || R.hidden.kind === 'window') items.push({ v: R.v, draw: () => drawWren(c) });
    items.sort((a, b) => a.v - b.v).forEach((it) => it.draw());
    drawSill(c, R.theme);
    // pebbles in flight, and the ring where one lands
    for (const s of R.shots) {
      const k = Math.min(1, s.t / s.dur);
      const q = proj(s.a.u + (s.b.u - s.a.u) * k, s.a.v + (s.b.v - s.a.v) * k, 40 * (1 - k) + Math.sin(k * Math.PI) * 30);
      if (!s.landed) { c.fillStyle = '#d8d0c0'; c.fillRect(Math.round(q.x), Math.round(q.y), 2, 2); }
      else {
        const r2 = (s.t - s.dur) * 60, e = proj(s.b.u, s.b.v);
        c.strokeStyle = 'rgba(240,220,160,' + Math.max(0, 0.6 - (s.t - s.dur)) + ')';
        c.strokeRect(Math.round(e.x - r2) + 0.5, Math.round(e.y - r2 * 0.3) + 0.5, Math.round(r2 * 2), Math.round(r2 * 0.6));
      }
    }
    if (R.dark) {
      c.fillStyle = 'rgba(6,8,20,0.45)'; c.fillRect(0, 0, VW, VH);
      for (const [x, y, rad] of lights) {
        const g = c.createRadialGradient(x, y, 2, x, y, rad * 0.8);
        g.addColorStop(0, 'rgba(255,190,110,0.18)'); g.addColorStop(1, 'rgba(255,170,90,0)');
        c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
    }
    // what E would use: a bobbing marker and its name, as the old adventures labelled things
    const bob = Math.floor(S.t * 3) % 2;
    if (R.aim) {
      const t = aimTargets()[R.aim.i];
      if (t) brackets(c, t.def ? personBox(t) : spotBox(t), Math.floor(S.t * 6) % 2 ? '#ff7a50' : '#f0d060');
      if (t && R.aim.kind === 'pebbles') {
        for (const p of pebbleListeners(t)) {
          const [x, y] = personBox(p);
          if (Math.floor(S.t * 4) % 2) drawText(c, '?', x, y - 16, '#f0d060', 3, 'center');
        }
      }
    } else if (!R.act && !R.path && R.caught <= 0 && !roomTakedownTarget()) {
      const sp = nearestSpot();
      if (sp && sp.kind !== 'window' && !(SPOT[sp.kind].verb === 'search' && sp.done && !HIDEABLE[sp.kind])) {
        const [x, y] = spotBox(sp);
        const name = LABEL[sp.kind];
        const wdt = textWidth(name, 1) + 6, lx = Math.round(Math.max(2 + wdt / 2, Math.min(VW - 2 - wdt / 2, x)));
        // above the thing, unless that would run into the prompt under the HUD: then below it
        const [, , , h] = spotBox(sp);
        const below = y - 16 < 44;
        const ly = below ? Math.round(y + h + 8) : Math.round(y - 16);
        c.fillStyle = 'rgba(10,8,7,0.8)'; c.fillRect(lx - wdt / 2, ly - 2, wdt, 9);
        drawText(c, name, lx, ly, '#f0e2c0', 1, 'center', null);
        c.fillStyle = '#e8c67a';
        if (below) { const ay = ly - 6 - bob; c.fillRect(lx, ay, 1, 1); c.fillRect(lx - 1, ay + 1, 3, 1); c.fillRect(lx - 2, ay + 2, 5, 1); }
        else { const ay = ly + 9 + bob; c.fillRect(lx - 2, ay, 5, 1); c.fillRect(lx - 1, ay + 1, 3, 1); c.fillRect(lx, ay + 2, 1, 1); }
      }
    }
    if (R.caught > 0) { c.fillStyle = 'rgba(160,20,10,' + (0.25 * (1 - R.caught)) + ')'; c.fillRect(0, 0, VW, VH); }
  }

  // The window she came in by is behind the camera; what shows is the middle of its
  // sill along the bottom edge, with the moonlight falling past her into the room.
  function drawSill(c, theme) {
    c.fillStyle = 'rgba(170,190,235,0.07)';
    c.beginPath(); c.moveTo(146, VH); c.lineTo(238, VH); c.lineTo(250, 140); c.lineTo(134, 140); c.closePath(); c.fill();
    const st = theme === 'abbey' ? '#8a8170' : theme === 'assize' ? '#7a7870' : '#7e6e60';
    c.fillStyle = shade(st, 0.55); c.fillRect(146, 208, 92, 8);
    c.fillStyle = st; c.fillRect(148, 206, 88, 5);
    c.fillStyle = shade(st, 1.35); c.fillRect(148, 206, 88, 1);
    c.fillStyle = shade(st, 0.7); c.fillRect(176, 207, 1, 4); c.fillRect(208, 207, 1, 4);
  }

  // Poses for the jobs: all but gazing out of the window are seen from behind.
  function actPose(act, t) {
    const back = { back: true };
    const stand = (hf, hb) => ({ h: [0, -24], n: [0, -20], hip: [0, -11], kf: [1.8, -6], ff: [2, 0], kb: [-1.8, -6], fb: [-2, 0], ef: [3.2, -16], hf, eb: [-3.2, -16], hb });
    switch (act) {
      case 'write': {
        const b = Math.sin(t * 7) * 0.8;
        return { pose: { h: [0, -19], n: [0, -15], hip: [0, -7], kf: [2, -5], ff: [2, 0], kb: [-2, -5], fb: [-2, 0], ef: [3, -11], hf: [2 + b, -12], eb: [-3, -11], hb: [-2, -12] }, opts: back };
      }
      case 'cook': { const a = t * 4; return { pose: stand([2 + Math.cos(a) * 1.5, -14 + Math.sin(a)], [-3.5, -12]), opts: back }; }
      case 'prep': return { pose: stand([2.5, -13 + Math.abs(Math.sin(t * 8)) * 2.5], [-2.5, -13]), opts: back };
      case 'browse': return { pose: stand([2.5, -25 + Math.sin(t * 2)], [-3.5, -11]), opts: back };
      case 'fetch': return { pose: stand([2.5, -17 + Math.sin(t * 3) * 2], [-2.5, -17]), opts: back };
      case 'warm': return { pose: stand([2, -14 + Math.sin(t * 2) * 0.5], [-2, -14 - Math.sin(t * 2) * 0.5]), opts: back };
      case 'lookout': return { pose: stand([3, -12], [-3, -12]), opts: back };
      case 'pray': {
        const b = Math.sin(t * 1.5) * 0.4;
        return { pose: { h: [0, -17 + b], n: [0, -13 + b], hip: [0, -6], kf: [1.5, -1], ff: [1.5, 0], kb: [-1.5, -1], fb: [-1.5, 0], ef: [2, -12], hf: [0.5, -17], eb: [-2, -12], hb: [-0.5, -17] }, opts: back };
      }
      default: return { pose: poseFor('idle', t * 0.4), opts: null };   // gazing out: side-on
    }
  }

  function drawWren(c) {
    const R = S.room;
    const inWin = R.hidden && R.hidden.kind === 'window';
    let pose = R.act ? P0.reach : inWin ? P0.crouch : R.pose === 'walk' ? walkPose(R.walkPh, 3.2) : poseFor(R.pose, S.t * 0.6);
    let v = R.v, lift = 0, opts = null;
    if (!R.act && !inWin && R.busy <= 0 && R.view && R.view !== 'side') {
      pose = walkDepthPose(R.pose === 'walk' ? R.walkPh : 0);
      opts = R.view === 'back' ? { back: true } : { front: true };
    }
    if (R.climbIn > 0) {
      // climbing in through the window behind the camera, back to us: hands come up
      // onto the sill, she hauls herself up and crouches on it, then hops down
      // up to the sill until only her hood and hands show over it; she waits there
      // hidden until you move, then hauls herself over and hops down
      const p = 1 - R.climbIn / CLIMB_IN, ease = (t) => t * t * (3 - 2 * t), pk = 1 - PEEK_AT;
      if (R.peek || p < pk) { pose = P0.peek; opts = { back: true }; lift = -100 + 35 * ease(p / pk) + (R.peek ? Math.sin(S.t * 2) * 0.8 : 0); }
      else if (p < 0.7) { pose = P0.crouch; opts = { back: true }; lift = -65 + 48 * ease(Math.min(1, (p - pk) / (0.7 - pk))); }
      else { const k = (p - 0.7) / 0.3; pose = P0.jump; lift = -17 + 17 * k + Math.sin(k * Math.PI) * 14; v = R.v + 0.08 * (1 - k); }
    }
    c.save();
    if (R.hidden && R.climbIn <= 0) c.globalAlpha = 0.45;   // crouched in the window: there, but out of sight
    const q = blitFigure(c, 'wren', pose, R.u, v, R.f, Object.assign({ blades: S.run.knife }, opts || {}), lift);
    c.restore();
    if (R.act) {
      const k = R.act.t / R.act.dur, y = Math.round(q.y - 64 * q.k);
      c.fillStyle = 'rgba(0,0,0,0.7)'; c.fillRect(Math.round(q.x - 16), y, 32, 4);
      c.fillStyle = '#e0c890'; c.fillRect(Math.round(q.x - 16), y, Math.round(32 * k), 4);
    }
  }

  function drawTitle(c, li) {
    // the town at night, panning slowly; on the title, the thief on a ridge
    const A = buildArt(li);
    let cx, cy;
    if (S.mode === 'title') { cx = Math.round(24 + Math.sin(S.t / 9) * 24); cy = -40; }
    else {
      const span = Math.max(0, A.W - VW);
      cx = Math.round(span / 2 + Math.sin(S.t / 14) * span / 2); cy = Math.round(A.camMaxY * 0.4);
    }
    drawTown(c, A, cx, cy);
    c.drawImage(A.fg, cx, cy + A.oy, VW, VH, 0, 0, VW, VH);
    if (S.mode === 'title') {
      drawFigure(c, 'wren', poseFor('idle', S.t * 0.6), 6 * T + 8 - cx, 5 * T - cy, 1, 1);
      c.fillStyle = 'rgba(8,6,5,0.3)'; c.fillRect(0, 0, VW, VH);
      drawText(c, 'TITHE', VW / 2, 34, '#e8d6a8', 6, 'center', '#1a120c');
      drawText(c, 'A THIEF IN VELL', VW / 2, 72, '#b8a888', 2, 'center');
    } else {
      c.fillStyle = 'rgba(8,6,5,0.4)'; c.fillRect(0, 0, VW, VH);
    }
  }

  // ---------- the loop ----------
  function frame() {
    const c = ctx;
    c.imageSmoothingEnabled = false;
    c.fillStyle = '#0a0908'; c.fillRect(0, 0, VW, VH);
    // what is behind the cards: the scene of whatever was last on screen
    if (S.scene === 'room' && S.room) drawRoom(c);
    else if (S.scene === 'ext' && S.world) drawExt(c);
    else drawTitle(c, S.introLi || 0);
    if (S.mode === 'ext' || S.mode === 'room' || S.mode === 'dead') {
      // a vignette, the screen's own shadow
      c.drawImage(vignette, 0, 0);
    }
    drawHud(c);
    // the iris: the window shift
    if (S.trans) {
      const tr = S.trans, k = Math.min(1, tr.t / tr.dur);
      const rad = tr.phase === 'close' ? (1 - k) * 420 : k * 420;
      const cx = tr.phase === 'close' ? tr.cx : VW / 2, cy = tr.phase === 'close' ? tr.cy : VH / 2;
      c.fillStyle = '#060504';
      c.beginPath(); c.rect(0, 0, VW, VH); c.arc(cx, cy, Math.max(0.1, rad), 0, Math.PI * 2, true); c.fill();
    }
    // room-mode title flash
    const tt = S.toasts.find((q) => q.title);
    if (tt && S.mode === 'room') {
      drawText(c, tt.text, VW / 2, 44, '#f0e2c0', 2, 'center');
    }
  }

  const vignette = (() => {
    const v = mk(VW, VH), g = v.getContext('2d');
    const rg = g.createRadialGradient(VW / 2, VH / 2, VH * 0.45, VW / 2, VH / 2, VW * 0.62);
    rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = rg; g.fillRect(0, 0, VW, VH);
    return v;
  })();

  // ---------- input ----------
  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down', Space: 'jump', KeyX: 'jump', KeyJ: 'jump',
    KeyE: 'act', Enter: 'act', KeyF: 'act', KeyQ: 'kill', KeyK: 'kill', Escape: 'leave',
  };
  function press(k) { if (!keys[k]) edge.add(k); keys[k] = true; lightPad(k, true); }
  function release(k) { keys[k] = false; lightPad(k, false); }
  addEventListener('keydown', (e) => {
    if (!card.hidden) return;
    if (e.code === 'KeyL' && (S.mode === 'ext' || S.mode === 'room')) { toggleLog(); return; }
    if (e.code === 'Digit1' && S.mode === 'room') { startAim('pebbles'); return; }
    if (e.code === 'Digit2' && S.mode === 'room') { startAim('darts'); return; }
    const k = KEYMAP[e.code];
    if (!k) return;
    e.preventDefault();
    if (e.repeat) return;
    press(k);
  });
  addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) release(k); });
  addEventListener('blur', () => { for (const k in keys) release(k); });

  function lightPad(k, on) {
    document.querySelectorAll('[data-k="' + k + '"]').forEach((b) => b.classList.toggle('down', on));
  }

  document.querySelectorAll('.pad [data-k]').forEach((b) => {
    const k = b.dataset.k;
    const up = (e) => { e.preventDefault(); release(k); };
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture && b.setPointerCapture(e.pointerId); unlockAudio(); press(k); });
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', () => release(k));
  });
  document.querySelectorAll('.pad [data-sel]').forEach((b) => {
    b.addEventListener('click', () => startAim(b.dataset.sel));
  });

  canvas.addEventListener('pointerdown', unlockAudio);

  // The quest log, top right: what the contract asks, every way you have found to
  // deal with the target and what each still needs, and what you are carrying.
  function renderLog() {
    const box = $('log'), body = $('log-body');
    const show = !!(S.run && S.world && (S.mode === 'ext' || S.mode === 'room'));
    box.hidden = !show;
    if (!show) return;
    const L = LEVELS[S.li];
    const obj = L.objectives.map((o) => '<li' + (o.item && has(o.item) ? ' class="done"' : '') + '>' + esc(o.text) + '</li>').join('');
    const found = L.methods.filter(knownM);
    const ways = found.map((m) => {
      const miss = missingFor(m);
      return '<li><b>' + esc(m.name) + '</b> <i>' + KIND_WORD[m.kind] + '</i><br>' + esc(m.how) + '<br><span class="' + (miss.length ? 'need' : 'ready') + '">' +
        (miss.length ? 'Needs ' + miss.map(itemName).join(', ') : 'Ready') + '</span></li>';
    });
    if (S.run.knife) ways.push('<li><b>With your knife</b> <i>kills</i><br>Get behind ' + L.pron + ' unseen and do it yourself.</li>');
    ways.push('<li><b>Leave ' + L.pron + ' be</b> <i>spares</i><br>Take what you came for and climb back out.</li>');
    const unknown = L.methods.length - found.length;
    const carry = S.run.items.map((id) => ITEM_NAMES[id]).filter(Boolean);
    body.innerHTML = '<h3>' + esc(L.name) + '</h3><ul class="obj">' + obj + '</ul>' +
      '<h4>Ways to deal with ' + esc(L.target) + '</h4><ul class="ways">' + ways.join('') + '</ul>' +
      (unknown ? '<p class="more">Keep searching: there ' + (unknown === 1 ? 'is another way' : 'are ' + unknown + ' more ways') + ' to find.</p>' : '') +
      (carry.length ? '<h4>Carrying</h4><p class="carry">' + carry.map(esc).join(', ') + '</p>' : '');
  }
  function toggleLog(open) {
    const body = $('log-body'), btn = $('log-toggle');
    const want = open != null ? open : body.hidden;
    body.hidden = !want; btn.setAttribute('aria-expanded', String(want));
    try { localStorage.setItem('tithe-log-open', want ? '1' : '0'); } catch (e) { /* fine */ }
  }
  $('log-toggle').addEventListener('click', () => toggleLog());
  try { if (localStorage.getItem('tithe-log-open') === '0') toggleLog(false); } catch (e) { /* fine */ }

  function syncPad() {
    renderLog();
    const pad = $('pad');
    pad.dataset.mode = S.mode === 'room' ? 'room' : 'ext';
    if (!S.run) return;
    $('n-pebbles').textContent = S.run.inv.pebbles;
    $('n-darts').textContent = S.run.inv.darts;
    document.querySelectorAll('.ctl-kill').forEach((b) => { b.hidden = !S.run.knife; });
    document.querySelectorAll('[data-sel]').forEach((b) => b.setAttribute('aria-pressed', String(!!(S.room && S.room.aim && S.room.aim.kind === b.dataset.sel))));
  }

  // Fit the canvas into the stage in whole multiples when it can, fractional
  // when the screen is too small for even 2x.
  function fit() {
    const r = stage.getBoundingClientRect();
    const k = Math.min(r.width / VW, r.height / VH);
    const s = k >= 2 ? Math.floor(k) : k;
    canvas.style.width = Math.floor(VW * s) + 'px';
    canvas.style.height = Math.floor(VH * s) + 'px';
  }
  addEventListener('resize', fit);

  // ---------- sound ----------
  let AC = null;
  function unlockAudio() {
    if (!S.sound || AC) return;
    try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; }
  }
  function tone(f0, f1, dur, type, vol, delay) {
    if (!AC) return;
    const t0 = AC.currentTime + (delay || 0);
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(vol || 0.05, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(AC.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function sfx(name) {
    if (!S.sound || !AC) return;
    switch (name) {
      case 'jump': tone(320, 520, 0.08, 'square', 0.03); break;
      case 'grab': tone(180, 120, 0.06, 'square', 0.04); break;
      case 'land': tone(110, 60, 0.05, 'triangle', 0.06); break;
      case 'coin': tone(880, 880, 0.05, 'square', 0.03); tone(1320, 1320, 0.08, 'square', 0.03, 0.05); break;
      case 'item': [523, 659, 784].forEach((f, i) => tone(f, f, 0.1, 'square', 0.035, i * 0.08)); break;
      case 'alert': tone(700, 900, 0.1, 'sawtooth', 0.04); tone(700, 900, 0.1, 'sawtooth', 0.04, 0.14); break;
      case 'hurt': tone(220, 90, 0.18, 'sawtooth', 0.05); break;
      case 'die': tone(300, 40, 0.7, 'triangle', 0.07); break;
      case 'stab': tone(900, 200, 0.07, 'sawtooth', 0.04); break;
      case 'thud': tone(90, 50, 0.12, 'triangle', 0.08); break;
      case 'window': tone(200, 400, 0.2, 'triangle', 0.04); break;
      case 'pebble': tone(1200, 800, 0.03, 'square', 0.03); tone(1000, 700, 0.03, 'square', 0.02, 0.07); break;
      case 'throw': tone(500, 300, 0.06, 'triangle', 0.03); break;
      case 'dart': tone(1500, 600, 0.06, 'sawtooth', 0.03); break;
      case 'bell': [660, 660, 660].forEach((f, i) => tone(f, f * 0.98, 0.3, 'sine', 0.05, i * 0.35)); break;
      case 'snuff': tone(300, 100, 0.12, 'triangle', 0.03); break;
      case 'rummage': tone(150, 130, 0.1, 'triangle', 0.02); break;
      case 'locked': tone(140, 140, 0.08, 'square', 0.04); break;
      case 'huh': tone(260, 340, 0.15, 'triangle', 0.05); break;
      case 'click': tone(600, 600, 0.02, 'square', 0.02); break;
    }
  }
  $('btn-sound').addEventListener('click', (e) => {
    S.sound = !S.sound;
    e.currentTarget.setAttribute('aria-pressed', String(S.sound));
    e.currentTarget.textContent = 'Sound: ' + (S.sound ? 'on' : 'off');
    if (S.sound) unlockAudio();
  });

  // ---------- pause ----------
  // Only out in the town or in a room: everywhere else is already a card that waits.
  function pauseGame() {
    if (!card.hidden || (S.mode !== 'ext' && S.mode !== 'room')) return;
    S.paused = true;
    for (const k in keys) release(k);
    showCard({
      title: 'Paused', low: true,
      body: '<p>The watch stands still. P carries on.</p>',
      actions: [
        { label: 'Restart', sub: 'Start again from the beginning, as if new', fn: () => {
          if (!confirm('Start over from the beginning? This run will be lost.')) return;
          try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* nothing to clear */ }
          location.reload();
        } },
        { label: 'Carry on', cls: 'go', fn: resumeGame },
      ],
    });
  }
  function resumeGame() { hideCard(); S.paused = false; }
  $('btn-pause').addEventListener('click', (e) => { e.currentTarget.blur(); pauseGame(); });
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyP') return;
    if (card.hidden) pauseGame();
    else if (card.querySelector('h2').textContent === 'Paused') resumeGame();
  });

  // ---------- help ----------
  const help = $('help');
  $('btn-help').addEventListener('click', () => { help.hidden = false; S.paused = true; });
  help.addEventListener('click', (e) => { if (e.target === help || e.target.dataset.close) { help.hidden = true; S.paused = false; } });

  // ---------- start ----------
  function title() {
    S.mode = 'title'; S.scene = 'title'; S.introLi = 0;
    const saved = load();
    const acts = [];
    if (saved) acts.push({ label: 'Continue', sub: LEVELS[saved.li].name, cls: 'go', fn: () => { hideCard(); S.run = clone(saved.run); S.lv = clone(saved.lv); S.snap = saved; startLevel(saved.li, true); } });
    acts.push({ label: saved ? 'New game' : 'Begin', cls: saved ? '' : 'go', fn: () => { hideCard(); newGame(); } });
    showCard({
      title: 'Tithe', low: true,
      body: '<p>Vell starves under three golden roofs. The Abbot takes the famine tithe, the Magistrate signs the Lowmarket out of its homes, and the Countess owns every grain of wheat between the river and the hills.</p><p>You are <b>Wren</b>. You take things back. What you do with them is up to you.</p>',
      actions: acts,
    });
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    frame();
    requestAnimationFrame(loop);
  }

  fit();
  title();
  requestAnimationFrame(loop);

  // The debug handle. Tests and screenshots drive the game through this rather
  // than by clicking on a canvas.
  expose('__tithe', {
    sim: ti,
    S, LEVELS, parseLevel, resolve, settle, reach, standable,
    get player() { return S.player; }, get guards() { return S.guards; }, get room() { return S.room; },
    newGame, startLevel, levelIntro, enterRoom, leaveRoom, tryWindow, finishMethod, leaveFinale, renderLog, lootChoice, fence, ending,
    takedown, roomTakedown, useSpot, doSpot, nearestSpot, walkTo, startAim, aimStep, aimFire, aimTargets, pebbleListeners, throwPebble, fireDart, proj, grant, checkpoint, restore, hideCard, showCard,
    press, release, update, frame,
    tick(secs, step) { const st = step || 1 / 60; for (let t = 0; t < secs; t += st) update(st); frame(); },
    toWindow(id) { const q = S.world.windows[id]; this.teleport(q.x, q.y, 1); },
    teleport(x, y, f) { const P = S.player; Object.assign(P, { state: 'ground', px: (x + 0.5) * T, py: (y + 1) * T, vx: 0, vy: 0, anim: null, busy: 0, skip: null, jumpBuf: 0 }); P.f = f || P.f; syncCell(P); },
    act(a) { edge.add(a); },
    MV,
    chaos: () => chaos(S.run),
  });
