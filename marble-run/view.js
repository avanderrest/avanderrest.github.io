/* Marble Run: the page. The pegboard in three.js (vendored), the box of pieces and the
   level list in HTML beside it, sound, the store, and the debug handle (window.__run).

   The sim works in cells with y up and the marble rolling in the plane of the board, so
   the scene uses the same numbers: one cell is one unit, the board's face is z = 0 and
   every piece stands out from it towards the camera. A marble's centre is at z = MZ, in the
   middle of a rail's depth, and it turns about z, which is how a marble rolling along a
   rail on a wall really turns. Everything here is drawn from the same lines the physics
   collides with (layout() and FITTINGS), so what you see is what the marble hits. */
import * as THREE from 'three';
import { createRun, PIECES, FITTINGS, R, T, DT, FRAME, pieceLines, layout } from './sim.js';
import { store } from '../lib/save.js';
import { createAudio, whenUnlocked } from '../lib/audio.js';
import { fixedLoop } from '../lib/loop.js';
import { expose } from '../lib/debug.js';

// ---------- constants ----------
const DEPTH = 0.36;               // how far a rail stands out from the board
const MZ = 0.19;                  // the marble's centre, out from the board
const FOV = 26;
const MARBLE_COLOURS = [
  { glass: '#4f8fcf', ribbons: ['#123f86', '#e9f2fa', '#f0b23a'] },   // sky, with a gold thread
  { glass: '#d9677f', ribbons: ['#8c1c37', '#ffe9e4', '#2f8a6f'] },   // rose, with a green one
];
const FLAP_SWING = 102.2 * Math.PI / 180;   // a toggle's flap swings this far between its two lines
const FLAP_PIVOT = [0.5, 0.559];            // where both of its lines cross
const ORDER = ['slope', 'steep', 'turn', 'funnel', 'stop', 'jump', 'spring', 'toggle'];
const FAIL_WORDS = {
  floor: 'It missed the cup. Change a piece and try again.',
  stuck: 'It came to a stop. Change a piece and try again.',
  time: 'That took too long. Change a piece and try again.',
};

const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const hasTouch = typeof matchMedia !== 'undefined' && matchMedia('(any-pointer: coarse)').matches;
if (hasTouch) document.documentElement.classList.add('has-touch');

// ---------- the game and its store ----------
const save = store('marble-run-save-v1');
const saved = save.load() || {};
const audio = createAudio('marble-run-sound', false);
const flipPref = {};                 // the way round each kind was last hung, for the next one
let ui = { tool: null, chosen: null, drag: null, hover: null, hint: null, hintT: 0, toastT: 0 };

const sfx = {
  hit(speed, mat) {
    const v = clamp(speed / 6, 0.05, 1);
    if (mat === 'brass') { audio.tone({ freq: 1500, to: 1300, dur: 0.18, type: 'sine', vol: 0.05 * v }); return; }
    const f = mat === 'beech' ? 520 : 360;
    audio.tone({ freq: f * (0.9 + 0.2 * v), to: f * 0.7, dur: 0.07, type: 'triangle', vol: 0.09 * v });
    audio.noise({ dur: 0.04, vol: 0.03 * v, filter: 'bandpass', freq: 2200, q: 2 });
  },
  clink(speed) { audio.tone({ freq: 2600, to: 2400, dur: 0.12, type: 'sine', vol: clamp(speed / 5, 0.1, 1) * 0.06 }); },
  bell() {
    audio.tone({ freq: 1318, dur: 1.4, type: 'sine', vol: 0.07 });
    audio.tone({ freq: 1976, dur: 0.9, type: 'sine', vol: 0.03 });
    audio.tone({ freq: 3290, dur: 0.4, type: 'sine', vol: 0.015 });
  },
  cup() {
    audio.tone({ freq: 880, to: 700, dur: 0.12, type: 'triangle', vol: 0.08 });
    [784, 988, 1175].forEach((f, i) => audio.tone({ freq: f, dur: 0.5, type: 'sine', vol: 0.05, delay: 0.08 + i * 0.09 }));
  },
  spring() { audio.tone({ freq: 160, to: 520, dur: 0.28, type: 'sine', vol: 0.09 }); },
  toggle() { audio.tone({ freq: 900, to: 600, dur: 0.04, type: 'square', vol: 0.025 }); },
  place() { audio.tone({ freq: 420, to: 300, dur: 0.06, type: 'triangle', vol: 0.08 }); },
  take() { audio.tone({ freq: 300, to: 220, dur: 0.07, type: 'triangle', vol: 0.07 }); },
  release() { audio.tone({ freq: 660, to: 990, dur: 0.1, type: 'triangle', vol: 0.05 }); },
  win() { [523, 659, 784, 1047].forEach((f, i) => audio.tone({ freq: f, dur: 0.4, type: 'triangle', vol: 0.06, delay: i * 0.1 })); },
  fail() { audio.tone({ freq: 220, to: 140, dur: 0.3, type: 'triangle', vol: 0.07 }); },
};

const game = createRun({
  saved,
  on(ev, d) {
    if (ev === 'save') save.save(d);
    else if (ev === 'hit') sfx.hit(d.speed, d.mat);
    else if (ev === 'clink') sfx.clink(d.speed);
    else if (ev === 'bell') { sfx.bell(); ringBell(d.x, d.y); }
    else if (ev === 'cup') sfx.cup();
    else if (ev === 'spring') { sfx.spring(); bounceSpring(d.piece); }
    else if (ev === 'toggle') sfx.toggle();
    else if (ev === 'win') onWin(d);
    else if (ev === 'fail') onFail(d);
  },
});

// ---------- three.js: renderer, scene, light ----------
const canvas = $('board');
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 200);

// a warm room to reflect, so the brass and the glass read as brass and glass
{
  const env = new THREE.Scene();
  const sky = new THREE.SphereGeometry(50, 32, 16);
  const c = new Float32Array(sky.attributes.position.count * 3);
  for (let i = 0; i < sky.attributes.position.count; i++) {
    const y = sky.attributes.position.getY(i) / 50;
    const k = y > 0 ? 0.5 + 0.5 * y : 0.14 + 0.2 * (1 + y);
    c[i * 3] = k * 1.0; c[i * 3 + 1] = k * 0.9; c[i * 3 + 2] = k * 0.78;
  }
  sky.setAttribute('color', new THREE.BufferAttribute(c, 3));
  env.add(new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  for (const [x, y, z, s] of [[-22, 30, 26, 1], [26, 18, 20, 0.6]]) {
    const lamp = new THREE.Mesh(new THREE.PlaneGeometry(22 * s, 14 * s), new THREE.MeshBasicMaterial({ color: '#fff4e0', side: THREE.DoubleSide }));
    lamp.position.set(x, y, z); lamp.lookAt(0, 0, 0); env.add(lamp);
  }
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(env, 0.04).texture;
  pm.dispose();
}
scene.add(new THREE.HemisphereLight('#fff1dc', '#3a2412', 0.65));
const sun = new THREE.DirectionalLight('#fff0d8', 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
sun.shadow.radius = 4;
scene.add(sun, sun.target);

// ---------- materials ----------
/* Her second mockup (2026-10-16): a warm walnut board in a wooden frame with a brass
   inlay, wooden crates for blocks, a hammered brass cup, brass rails. */
const loader = new THREE.TextureLoader();
function woodTex(url, turned = false) {
  const t = loader.load(url);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (turned) { t.center.set(0.5, 0.5); t.rotation = Math.PI / 2; }   // beech grain runs up the image
  return t;
}
const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
// A crate's face: planks with a diagonal brace inside a dark iron-bound edge.
function crateTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const rnd = seeded(11);
  const planks = (x0, y0, w, h) => {
    g.fillStyle = '#8a5a36'; g.fillRect(x0, y0, w, h);
    for (let i = 0; i < 70; i++) {
      const y = y0 + rnd() * h;
      g.strokeStyle = rnd() > 0.5 ? 'rgba(255,214,160,0.10)' : 'rgba(40,20,8,0.16)';
      g.lineWidth = 0.8 + rnd() * 1.6;
      g.beginPath(); g.moveTo(x0, y); g.bezierCurveTo(x0 + w * 0.3, y + rnd() * 6 - 3, x0 + w * 0.7, y + rnd() * 6 - 3, x0 + w, y); g.stroke();
    }
  };
  g.fillStyle = '#4a4440'; g.fillRect(0, 0, 256, 256);              // iron band
  g.fillStyle = '#7d756d'; g.fillRect(4, 4, 248, 3); g.fillRect(4, 4, 3, 248);
  planks(18, 18, 220, 220);
  g.strokeStyle = 'rgba(30,14,4,0.6)'; g.lineWidth = 3; g.strokeRect(30, 30, 196, 196);
  // the brace, corner to corner
  g.save(); g.beginPath(); g.rect(30, 30, 196, 196); g.clip();
  g.translate(128, 128); g.rotate(-Math.PI / 4);
  g.fillStyle = 'rgba(30,14,4,0.55)'; g.fillRect(-150, -19, 300, 38);
  g.fillStyle = '#9a6840'; g.fillRect(-150, -16, 300, 32);
  g.restore();
  for (const [x, y] of [[11, 11], [245, 11], [11, 245], [245, 245]]) {    // rivets
    g.fillStyle = '#a49b90'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
// Dimples for the hammered brass cup, as a bump map.
function hammeredTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, 128, 128);
  const rnd = seeded(5);
  for (let i = 0; i < 90; i++) {
    const x = rnd() * 128, y = rnd() * 128, r = 5 + rnd() * 7;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const hammered = hammeredTexture();
const mat = {
  board: new THREE.MeshStandardMaterial({ map: woodTex('assets/beech.jpg', true), roughness: 0.45, color: '#8a7868' }),
  frame: new THREE.MeshStandardMaterial({ map: woodTex('assets/beech.jpg', true), roughness: 0.4, color: '#6e5a4a' }),
  frameLip: new THREE.MeshStandardMaterial({ color: '#d4a64e', metalness: 0.95, roughness: 0.3 }),   // the brass inlay
  walnut: new THREE.MeshStandardMaterial({ color: '#c99a45', metalness: 0.9, roughness: 0.32 }),     // brackets: brass
  crate: new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.6 }),
  crateSide: new THREE.MeshStandardMaterial({ color: '#4a4440', metalness: 0.6, roughness: 0.5 }),
  cup: new THREE.MeshStandardMaterial({ color: '#e0b04e', metalness: 0.95, roughness: 0.28, bumpMap: hammered, bumpScale: 0.35 }),
  // the level's own pieces: dark bronze, so they read as fixed beside your bright brass
  stained: new THREE.MeshStandardMaterial({ color: '#7a5634', metalness: 0.85, roughness: 0.4 }),
  beech: new THREE.MeshStandardMaterial({ color: '#e8bc5c', metalness: 0.95, roughness: 0.22 }),   // your pieces: bright brass
  brass: new THREE.MeshStandardMaterial({ color: '#d8a948', metalness: 0.92, roughness: 0.3 }),
  grommet: new THREE.MeshStandardMaterial({ color: '#c9973e', metalness: 0.95, roughness: 0.3 }),
  rubber: new THREE.MeshStandardMaterial({ color: '#b8332a', roughness: 0.75 }),
  hole: new THREE.MeshBasicMaterial({ color: '#1a0f07' }),
  nope: new THREE.MeshStandardMaterial({ color: '#2a180c', roughness: 0.9 }),
  bellCell: new THREE.MeshBasicMaterial({ color: '#e8b94e', transparent: true, opacity: 0.1, depthWrite: false }),
  cellOk: new THREE.MeshBasicMaterial({ color: '#f6d58c', transparent: true, opacity: 0.08, depthWrite: false }),
  ghost: new THREE.MeshStandardMaterial({ color: '#ffe2a8', transparent: true, opacity: 0.5, roughness: 0.6, depthWrite: false }),
  ghostFaint: new THREE.MeshStandardMaterial({ color: '#ffe2a8', transparent: true, opacity: 0.28, roughness: 0.6, depthWrite: false }),
  ghostBad: new THREE.MeshStandardMaterial({ color: '#ff8a7a', transparent: true, opacity: 0.4, roughness: 0.6, depthWrite: false }),
  hint: new THREE.MeshStandardMaterial({ color: '#9ff0a8', transparent: true, opacity: 0.55, roughness: 0.6, depthWrite: false, emissive: '#2f6a34' }),
  chosen: new THREE.MeshBasicMaterial({ color: '#ffd77a', transparent: true, opacity: 0.22, depthWrite: false }),
};

// A swirl for the inside of a marble: glass with three ribbons wound round it, so its turning
// shows from any side.
function marbleTexture(col, seed) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = col.glass; g.fillRect(0, 0, 512, 256);
  col.ribbons.forEach((rc, k) => {
    g.strokeStyle = rc; g.lineWidth = k === 2 ? 10 : 26; g.globalAlpha = k === 2 ? 0.8 : 0.9;
    g.beginPath();
    for (let x = -10; x <= 522; x += 6) {
      const y = 128 + Math.sin((x / 512) * Math.PI * 2 * (k + 1) + seed + k * 2.1) * (60 - k * 14) + (k - 1) * 30;
      if (x === -10) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const marbleMats = MARBLE_COLOURS.map((col, i) => new THREE.MeshPhysicalMaterial({
  map: marbleTexture(col, i * 1.7), roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03,
  envMapIntensity: 0.8,
}));
const marbleGeo = new THREE.SphereGeometry(R, 40, 28);

// ---------- building pieces out of their lines ----------
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const pinGeo = new THREE.CylinderGeometry(1, 1, 1, 18);
pinGeo.rotateX(Math.PI / 2);

function railMesh(ax, ay, bx, by, material, depth = DEPTH, thick = 2 * T) {
  const len = Math.hypot(bx - ax, by - ay);
  const m = new THREE.Mesh(boxGeo, material);
  m.scale.set(len, thick, depth);
  m.position.set((ax + bx) / 2, (ay + by) / 2, depth / 2);
  m.rotation.z = Math.atan2(by - ay, bx - ax);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function jointMesh(x, y, material, depth = DEPTH) {
  const m = new THREE.Mesh(pinGeo, material);
  m.scale.set(T, T, depth);
  m.position.set(x, y, depth / 2);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
// A polyline (in cell space, offset to the cell) as rails with rounded joints.
function linesGroup(lines, ox, oy, material, depth) {
  const g = new THREE.Group();
  for (const l of lines) {
    for (let k = 0; k + 1 < l.length; k++) g.add(railMesh(ox + l[k][0], oy + l[k][1], ox + l[k + 1][0], oy + l[k + 1][1], material, depth));
    for (const [x, y] of l) g.add(jointMesh(ox + x, oy + y, material, depth));
  }
  return g;
}
// A brass screw where the piece hangs on the board, and the bracket under the rail it
// goes through: a small gunmetal plate on the board with a screw head showing below.
function screw(x, y) {
  const g = new THREE.Group();
  const tab = new THREE.Mesh(boxGeo, mat.walnut);
  tab.scale.set(0.12, 0.16, 0.03); tab.position.set(x, y - 0.1, 0.015);
  tab.receiveShadow = true;
  const head = new THREE.Mesh(pinGeo, mat.brass);
  head.scale.set(0.032, 0.032, 0.02); head.position.set(x, y - 0.13, 0.04);
  const m = new THREE.Mesh(pinGeo, mat.brass);
  m.scale.set(0.035, 0.035, 0.02);
  m.position.set(x, y, DEPTH + 0.01);
  g.add(tab, head, m);
  return g;
}

function pieceGroup(p, material) {
  const g = new THREE.Group();
  if (p.kind === 'toggle') {
    // the flap swings about its pivot: built at state 0, turned to the state it is in
    const [l] = pieceLines('toggle', p.flip, 0);
    const px = p.flip ? 1 - FLAP_PIVOT[0] : FLAP_PIVOT[0], py = FLAP_PIVOT[1];
    const flap = new THREE.Group();
    flap.position.set(p.x + px, p.y + py, 0);
    flap.add(linesGroup([l.map(([x, y]) => [x - px, y - py])], 0, 0, material));
    const pin = new THREE.Mesh(pinGeo, mat.brass);
    pin.scale.set(0.05, 0.05, DEPTH + 0.06); pin.position.set(0, 0, (DEPTH + 0.06) / 2);
    flap.add(pin);
    g.add(flap);
    g.userData.flap = flap;
    g.userData.sign = p.flip ? -1 : 1;
    return g;
  }
  g.add(linesGroup(p.lines || pieceLines(p.kind, p.flip), p.x, p.y, material));
  if (p.kind === 'spring') {
    // a rubber pad on two brass coils
    const [[[ax, ay], [bx, by]]] = p.lines || pieceLines('spring', p.flip);
    const pad = railMesh(p.x + ax, p.y + ay + 0.03, p.x + bx, p.y + by + 0.03, mat.rubber, DEPTH * 0.96, 0.04);
    g.add(pad);
    for (const u of [0.25, 0.75]) {
      const x = p.x + ax + (bx - ax) * u, y = p.y + ay + (by - ay) * u;
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 16), mat.brass);
      coil.rotation.x = Math.PI / 2;
      for (let k = 0; k < 3; k++) {
        const c = coil.clone(); c.position.set(x, y - 0.05 - k * 0.035, DEPTH / 2); g.add(c);
      }
    }
    g.userData.pad = pad;
  }
  const first = (p.lines || pieceLines(p.kind, p.flip))[0];
  const mid = first[Math.floor((first.length - 1) / 2)];
  g.add(screw(p.x + mid[0], p.y + mid[1]));
  return g;
}

// Hand any group a material for ghosts and hints.
function tinted(group, material) {
  group.traverse((o) => { if (o.isMesh) { o.material = material; o.castShadow = false; } });
  return group;
}

// ---------- the board ----------
const boardGroup = new THREE.Group();     // board, frame, holes, fittings: rebuilt per level
const pieceGroupAll = new THREE.Group();  // pieces: rebuilt on every edit
const fxGroup = new THREE.Group();        // ghost, hint, chosen mark
const marbleGroup = new THREE.Group();
scene.add(boardGroup, pieceGroupAll, fxGroup, marbleGroup);
let bells = [];                           // { x, y, mesh, swing, t }
let cupGlow = [];
let shownWorld = null;
let pieceMeshes = [];                     // parallel to game.world.pieces
let marbleMeshes = [];

function clearGroup(g) {
  for (const c of [...g.children]) {
    g.remove(c);
    c.traverse((o) => { if (o.geometry && o.geometry !== boxGeo && o.geometry !== pinGeo && o.geometry !== marbleGeo) o.geometry.dispose(); });
  }
}

function buildBoard() {
  clearGroup(boardGroup);
  const L = game.L, w = L.w, h = L.h;
  const pad = FRAME;
  // the board itself, and a walnut frame round it, which the marble hits
  const board = new THREE.Mesh(new THREE.BoxGeometry(w + pad * 2, h + pad * 2, 0.3), mat.board);
  board.position.set(w / 2, h / 2, -0.15);
  board.receiveShadow = true;
  // the grain runs in long horizontal boards, about four cells to a length
  mat.board.map.repeat.set((h + pad * 2) / 2.5, (w + pad * 2) / 5);   // turned: u runs up the board
  boardGroup.add(board);
  const fw = 0.28;
  for (const [x, y, sx, sy] of [
    [w / 2, -pad - fw / 2, w + 2 * pad + 2 * fw, fw], [w / 2, h + pad + fw / 2, w + 2 * pad + 2 * fw, fw],
    [-pad - fw / 2, h / 2, fw, h + 2 * pad], [w + pad + fw / 2, h / 2, fw, h + 2 * pad],
  ]) {
    const f = new THREE.Mesh(boxGeo, mat.frame);
    f.scale.set(sx, sy, 0.5); f.position.set(x, y, 0.0);
    f.castShadow = true; f.receiveShadow = true;
    boardGroup.add(f);
  }
  // a thin brass inlay where the frame meets the board
  const lip = 0.04;
  for (const [x, y, sx, sy] of [
    [w / 2, -pad + lip / 2, w + 2 * pad, lip], [w / 2, h + pad - lip / 2, w + 2 * pad, lip],
    [-pad + lip / 2, h / 2, lip, h + 2 * pad], [w + pad - lip / 2, h / 2, lip, h + 2 * pad],
  ]) {
    const f = new THREE.Mesh(boxGeo, mat.frameLip);
    f.scale.set(sx, sy, 0.03); f.position.set(x, y, 0.015);
    f.receiveShadow = true;
    boardGroup.add(f);
  }
  // brass grommets at the cell corners, so the grid you hang pieces on reads at a glance,
  // except where no cell beside them can take a piece
  const spots = [];
  const open = (x, y) => x >= 0 && y >= 0 && x < w && y < h && L.cells[y * w + x] !== 'nope';
  for (let y = 0; y <= h; y++) {
    for (let x = 0; x <= w; x++) {
      if (open(x, y) || open(x - 1, y) || open(x, y - 1) || open(x - 1, y - 1)) spots.push([x, y]);
    }
  }
  const ringGeo = new THREE.TorusGeometry(0.06, 0.012, 8, 24);
  const holeGeo = new THREE.CircleGeometry(0.055, 16);
  const rings = new THREE.InstancedMesh(ringGeo, mat.grommet, spots.length);
  const holes = new THREE.InstancedMesh(holeGeo, mat.hole, spots.length);
  rings.receiveShadow = true;
  const m4 = new THREE.Matrix4();
  spots.forEach(([x, y], i) => {
    m4.makeTranslation(x, y, 0.006); rings.setMatrixAt(i, m4);
    m4.makeTranslation(x, y, 0.003); holes.setMatrixAt(i, m4);
  });
  boardGroup.add(rings, holes);
  // cells nothing can hang in: a dark recess; bell cells: a faint brass wash
  for (let i = 0; i < L.cells.length; i++) {
    const x = i % w, y = Math.floor(i / w), c = L.cells[i];
    if (c === 'nope') {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat.nope);
      m.position.set(x + 0.5, y + 0.5, 0.001); m.receiveShadow = true;
      boardGroup.add(m);
    } else if (c === 'bell') {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.96), mat.bellCell);
      m.position.set(x + 0.5, y + 0.5, 0.003);
      boardGroup.add(m);
    } else if (c === 'block') {
      // a wooden crate: its face painted, iron at the sides (box faces: +x -x +y -y +z -z)
      const b = new THREE.Mesh(boxGeo, [mat.crateSide, mat.crateSide, mat.crateSide, mat.crateSide, mat.crate, mat.crateSide]);
      b.scale.set(0.92, 0.92, DEPTH + 0.04); b.position.set(x + 0.5, y + 0.5, (DEPTH + 0.04) / 2);
      b.castShadow = true; b.receiveShadow = true;
      boardGroup.add(b);
    }
  }
  // the hopper
  const S = L.start;
  const hop = linesGroup(FITTINGS.start().map((l) => l.map(([x, y]) => [S.flip ? 1 - x : x, y])), S.x, S.y, mat.brass);
  boardGroup.add(hop);
  // cups: brass, with a back plate so the inside reads as a cup
  cupGlow = [];
  for (const c of L.cups) {
    boardGroup.add(linesGroup(FITTINGS.cup(), c.x, c.y, mat.cup));
    const back = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.7), new THREE.MeshStandardMaterial({ color: '#a67a2c', metalness: 0.9, roughness: 0.34, bumpMap: hammered, bumpScale: 0.35, emissive: '#000000' }));
    back.position.set(c.x + 0.5, c.y + 0.45, 0.004);
    boardGroup.add(back);
    cupGlow.push({ c, back });
  }
  // bells: brass, hung from a little walnut bracket at the top of their cell
  bells = [];
  const profile = [];
  for (let k = 0; k <= 12; k++) {
    const t = k / 12;
    profile.push(new THREE.Vector2(0.03 + 0.12 * Math.pow(t, 1.6) + (t > 0.85 ? (t - 0.85) * 0.3 : 0), 0.24 * (1 - t)));
  }
  const bellGeo = new THREE.LatheGeometry(profile, 28);
  for (const b of L.bells) {
    const bracket = new THREE.Mesh(boxGeo, mat.walnut);
    bracket.scale.set(0.08, 0.06, DEPTH * 0.6); bracket.position.set(b.x + 0.5, b.y + 0.93, DEPTH * 0.3);
    bracket.castShadow = true;
    const hang = new THREE.Group();
    hang.position.set(b.x + 0.5, b.y + 0.92, DEPTH * 0.55);
    const bell = new THREE.Mesh(bellGeo, new THREE.MeshStandardMaterial({ color: '#dcae4c', metalness: 0.95, roughness: 0.26, emissive: '#000000' }));
    bell.position.y = -0.26;
    bell.castShadow = true;
    const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), mat.brass);
    clapper.position.y = -0.27;
    hang.add(bell, clapper);
    boardGroup.add(bracket, hang);
    bells.push({ x: b.x, y: b.y, hang, bell, swing: 0, t: 0, rung: false });
  }
  // the light and its shadow camera cover the board
  sun.position.set(w / 2 - w * 0.5, h / 2 + h * 0.9, Math.max(w, h) * 1.2);
  sun.target.position.set(w / 2, h / 2, 0);
  const sc = sun.shadow.camera, span = Math.max(w, h) * 0.85;
  sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.near = 0.5; sc.far = Math.max(w, h) * 4;
  sc.updateProjectionMatrix();
  fitCamera();
  shownWorld = null;
}

/* Pieces are rebuilt on every edit. A slope whose rail changed under it (one joined or
   left beside it) eases from its old angle to its new one rather than jumping, so you can
   see the rail re-tilt as a whole. */
const TILT_SECS = 0.22;
let tilting = [];                          // { i, from, to, t }
function buildPieces() {
  const before = new Map((shownWorld ? shownWorld.pieces : []).map((p) => [p.x + ',' + p.y, p]));
  const sameLevel = shownWorld && shownWorld.L === game.L;
  clearGroup(pieceGroupAll);
  const W = game.world;
  tilting = [];
  pieceMeshes = W.pieces.map((p, i) => {
    const was = before.get(p.x + ',' + p.y);
    if (sameLevel && p.kind === 'slope' && was && was.kind === 'slope' && !sameLines(was.lines, p.lines)) {
      tilting.push({ i, from: was.lines, to: p.lines, t: 0 });
    }
    const g = pieceGroup(p, p.fixed ? mat.stained : mat.beech);
    pieceGroupAll.add(g);
    return g;
  });
  clearGroup(marbleGroup);
  marbleMeshes = [];
  for (const b of bells) { b.rung = false; b.bell.material.emissive.set('#000000'); }
  for (const c of cupGlow) c.back.material.emissive.set('#000000');
  shownWorld = W;
}
function stepTilts(dt) {
  if (!tilting.length) return;
  for (const a of tilting) {
    a.t = Math.min(1, a.t + dt / TILT_SECS);
    const k = 1 - (1 - a.t) ** 3;
    const p = game.world.pieces[a.i];
    const lines = a.to.map((l, li) => l.map(([x, y], pi) => {
      const [fx, fy] = (a.from[li] && a.from[li][pi]) || [x, y];
      return [fx + (x - fx) * k, fy + (y - fy) * k];
    }));
    const old = pieceMeshes[a.i];
    const g = pieceGroup({ ...p, lines }, p.fixed ? mat.stained : mat.beech);
    pieceGroupAll.remove(old);
    old.traverse((o) => { if (o.geometry && o.geometry !== boxGeo && o.geometry !== pinGeo && o.geometry !== marbleGeo) o.geometry.dispose(); });
    pieceGroupAll.add(g);
    pieceMeshes[a.i] = g;
  }
  tilting = tilting.filter((a) => a.t < 1);
}

// Marbles waiting in the hopper while you build: the first one where it will start, any
// others queued up behind it.
function waitingMarbles() {
  const L = game.L, S = L.start;
  const out = [];
  for (let i = 0; i < L.marbles; i++) {
    const lx = S.flip ? 1 - 0.32 + i * 0.27 : 0.32 - i * 0.27;
    out.push({ x: S.x + lx, y: S.y + 0.64 + T + R + i * 0.02, a: i * 1.3, id: i });
  }
  return out;
}

function syncMarbles() {
  const W = game.world;
  const list = game.mode === 'build' ? waitingMarbles() : W.marbles;
  while (marbleMeshes.length < list.length) {
    const m = new THREE.Mesh(marbleGeo, marbleMats[marbleMeshes.length % marbleMats.length]);
    m.castShadow = true;
    m.rotation.order = 'ZYX';   // the tilt is the marble's own; the roll is about the board's normal
    marbleGroup.add(m);
    marbleMeshes.push(m);
  }
  marbleMeshes.forEach((mesh, i) => {
    const m = list[i];
    mesh.visible = !!m;
    if (!m) return;
    mesh.position.set(m.x, m.y, MZ);
    mesh.rotation.set(0.35, 0, m.a);   // a slight tilt so the ribbons' path shows, then the roll
  });
}

// ---------- the camera ----------
function fitCamera() {
  const rect = stage.getBoundingClientRect();
  const wpx = Math.max(1, rect.width), hpx = Math.max(1, rect.height);
  renderer.setSize(wpx, hpx, false);
  camera.aspect = wpx / hpx;
  const L = game.L;
  const bw = L.w + 1.6, bh = L.h + 1.6 + 1.1;   // room under the board for the Release button
  const tan = Math.tan((FOV / 2) * Math.PI / 180);
  const d = Math.max(bh / 2 / tan, bw / 2 / (tan * camera.aspect));
  const cx = L.w / 2, cy = L.h / 2 - 0.45;
  // a little from above and to the right, so the rails' tops and depth show
  camera.position.set(cx + d * 0.035, cy + d * 0.07, d);
  camera.lookAt(cx, cy, 0);
  camera.updateProjectionMatrix();
  placeStitching(wpx, hpx);
}
// The desk mat's stitching runs round the board, a little out from its frame, with the
// Release button below it: CSS draws it from where the frame's corners land on screen.
function placeStitching(wpx, hpx) {
  const L = game.L, m = FRAME + 0.28 + 0.14;   // the frame's outer edge, then a margin
  camera.updateMatrixWorld();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of [[-m, -m], [L.w + m, -m], [-m, L.h + m], [L.w + m, L.h + m]]) {
    const v = new THREE.Vector3(x, y, 0.25).project(camera);
    const sx = (v.x + 1) / 2 * wpx, sy = (1 - v.y) / 2 * hpx;
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
  }
  const st = stage.style;
  st.setProperty('--stitch-l', Math.max(6, x0).toFixed(1) + 'px');
  st.setProperty('--stitch-t', Math.max(6, y0).toFixed(1) + 'px');
  st.setProperty('--stitch-r', Math.max(6, wpx - x1).toFixed(1) + 'px');
  st.setProperty('--stitch-b', Math.max(6, hpx - y1).toFixed(1) + 'px');
}
new ResizeObserver(() => { fitCamera(); placePieceBar(); }).observe(stage);

// ---------- picking ----------
const ray = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -MZ);
const hit = new THREE.Vector3();
function cellAt(ev) {
  const r = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (!ray.ray.intersectPlane(plane, hit)) return null;
  const x = Math.floor(hit.x), y = Math.floor(hit.y);
  return { x, y, inside: x >= 0 && y >= 0 && x < game.L.w && y < game.L.h };
}
function screenOf(x, y, z = DEPTH) {
  const v = new THREE.Vector3(x, y, z).project(camera);
  const r = canvas.getBoundingClientRect(), s = stage.getBoundingClientRect();
  return { x: (v.x + 1) / 2 * r.width + r.left - s.left, y: (1 - v.y) / 2 * r.height + r.top - s.top };
}

// ---------- ghost, hint and chosen marks ----------
function refreshFx() {
  clearGroup(fxGroup);
  if (game.mode !== 'build') return;
  const c = ui.drag && ui.drag.moved ? ui.drag.to : ui.hover;
  if (ui.tool && c && c.inside && !(ui.drag && ui.drag.moved)) {
    const ok = game.canPlace(ui.tool, c.x, c.y);
    if (ok || !game.at(c.x, c.y)) {
      const p = { kind: ui.tool, x: c.x, y: c.y, flip: !!flipPref[ui.tool] };
      ghostOf(ok ? [...game.placed, p] : null, p, ok ? mat.ghost : mat.ghostBad);
    }
  }
  if (ui.drag && ui.drag.moved && c && c.inside) {
    const p = ui.drag.piece;
    const ok = (c.x === p.x && c.y === p.y) || (canHangHere(c.x, c.y) && !game.at(c.x, c.y));
    const to = { kind: p.kind, x: c.x, y: c.y, flip: p.flip };
    ghostOf(ok ? [...game.placed.filter((q) => q !== p && !(q.x === p.x && q.y === p.y)), to] : null, to, ok ? mat.ghost : mat.ghostBad);
  }
  if (ui.hint) {
    const h = ui.hint;
    ghostOf([...game.placed.filter((q) => !(q.x === h.x && q.y === h.y)), h], { kind: h.kind, x: h.x, y: h.y, flip: h.flip }, mat.hint);
  }
  if (ui.chosen) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.98), mat.chosen);
    m.position.set(ui.chosen.x + 0.5, ui.chosen.y + 0.5, 0.004);
    fxGroup.add(m);
  }
}
/* The ghost of a piece as it would really hang: a slope beside other slopes (or the hopper)
   joins their rail, so it is drawn at the rail's angle, and every slope in that rail that
   would re-tilt gets a faint ghost of its new angle too. `list` is the whole placed set
   with the change made, or null to draw the piece on its own (where it cannot go). */
function ghostOf(list, p, material) {
  if (!list) { fxGroup.add(tinted(pieceGroup(p, material), material)); return; }
  const now = new Map(game.world.pieces.map((q) => [q.x + ',' + q.y, q]));
  for (const q of layout(game.L, list)) {
    const mine = q.x === p.x && q.y === p.y;
    const was = now.get(q.x + ',' + q.y);
    if (!mine && (!was || sameLines(was.lines, q.lines))) continue;
    const g = tinted(pieceGroup(q, material), mine ? material : mat.ghostFaint);
    fxGroup.add(g);
  }
}
const sameLines = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const canHangHere = (x, y) => x >= 0 && y >= 0 && x < game.L.w && y < game.L.h && game.L.cells[y * game.L.w + x] === 'empty';

// ---------- bells and springs ----------
function ringBell(x, y) {
  const b = bells.find((q) => q.x === x && q.y === y);
  if (!b) return;
  b.swing = 0.55; b.t = 0; b.rung = true;
  b.bell.material.emissive.set('#5a3c08');
}
function bounceSpring(piece) {
  const i = game.world.pieces.indexOf(piece);
  const g = pieceMeshes[i];
  if (g) g.userData.boing = 1;
}

// ---------- HTML: the box, the level, the list ----------
function iconSvg(kind, flip = false) {
  const lines = pieceLines(kind, flip, 0);
  const d = lines.map((l) => 'M' + l.map(([x, y]) => `${(4 + x * 36).toFixed(1)} ${(40 - y * 36).toFixed(1)}`).join(' L')).join(' ');
  const extra = kind === 'spring' ? `<path d="${d}" stroke="#b8332a" stroke-width="3" transform="translate(0 -2.5)" fill="none" stroke-linecap="round"/>` : '';
  return `<svg viewBox="0 0 44 44" aria-hidden="true"><rect x="4" y="4" width="36" height="36" rx="3" fill="rgba(0,0,0,0.22)"/>` +
    `<path d="${d}" stroke="#e8c48c" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>${extra}</svg>`;
}

function renderBox() {
  const box = $('box');
  box.innerHTML = '';
  const kinds = ORDER.filter((k) => (game.L.give[k] || 0) > 0);
  for (const kind of kinds) {
    const left = game.left(kind);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = ui.tool === kind ? 'on' : '';
    b.setAttribute('aria-pressed', ui.tool === kind ? 'true' : 'false');
    b.disabled = left <= 0 || game.mode !== 'build';
    b.title = PIECES[kind].tip;
    b.innerHTML = `${iconSvg(kind, !!flipPref[kind])}<span>${PIECES[kind].name}</span><span class="count">${left}</span>`;
    b.addEventListener('click', () => { pickTool(ui.tool === kind ? null : kind); });
    box.appendChild(b);
  }
  $('box-sub').textContent = ui.tool ? `Tap a cell for a ${PIECES[ui.tool].name.toLowerCase()}` : 'Pick one, then a cell';
}

function starsText(st) { return st.map((s) => (s ? '★' : '☆')).join(''); }

function renderLevel() {
  const L = game.L, rec = game.record;
  $('level-title').textContent = `Level ${game.idx + 1} of ${game.LEVELS.length}`;
  $('level-name').textContent = L.name;
  $('level-note').textContent = L.note;
  $('level-stars').textContent = starsText(rec.stars);
  $('goal-cup').classList.toggle('got', rec.stars[0]);
  $('goal-bells').hidden = !L.bells.length;
  $('goal-bells').classList.toggle('got', rec.stars[1] || !L.bells.length);
  $('goal-par').classList.toggle('got', rec.stars[2]);
  $('goal-par-text').textContent = `${L.par} piece${L.par === 1 ? '' : 's'} or fewer` + (L.marbles > 1 ? '' : '');
  $('goal-cup').querySelector('span').textContent = L.marbles > 1 ? `Both marbles home` : 'Into the cup';
  renderLevels();
}

function renderLevels() {
  const wrap = $('levels');
  wrap.innerHTML = '';
  game.LEVELS.forEach((def, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    const rec = game.store.levels[def.id];
    const st = rec ? rec.stars : [false, false, false];
    b.className = i === game.idx ? 'on' : '';
    b.disabled = !game.unlocked(i);
    b.title = game.unlocked(i) ? def.name : 'Get the marble home on the level before';
    b.innerHTML = `${i + 1}<small>${st.some(Boolean) ? starsText(st) : ''}</small>`;
    b.addEventListener('click', () => goLevel(i));
    wrap.appendChild(b);
  });
  $('levels-sub').textContent = `${game.totalStars()} of ${game.LEVELS.length * 3} stars`;
}

function renderRun() {
  const btn = $('btn-release');
  const running = game.mode !== 'build';
  btn.textContent = game.mode === 'won' ? 'Reset' : running ? 'Stop' : 'Release';
  btn.classList.toggle('stop', running);
  $('btn-clear').disabled = game.mode !== 'build' || !game.placed.length;
  $('btn-hint').disabled = game.mode !== 'build';
  canvas.classList.toggle('holding', !!ui.tool && game.mode === 'build');
}

function renderAll() { renderBox(); renderLevel(); renderRun(); refreshFx(); placePieceBar(); }

function placePieceBar() {
  const bar = $('piece-bar');
  const p = ui.chosen && game.mode === 'build' ? game.at(ui.chosen.x, ui.chosen.y) : null;
  if (!p) { bar.hidden = true; return; }
  bar.hidden = false;
  $('btn-flip').disabled = !!PIECES[p.kind].sym;
  const s = screenOf(p.x + 0.5, p.y, DEPTH);
  const st = stage.getBoundingClientRect();
  bar.style.left = clamp(s.x, 90, st.width - 90) + 'px';
  bar.style.top = clamp(s.y + 8, 8, st.height - 110) + 'px';
}

function toast(text, secs = 2.2) {
  const t = $('toast');
  t.textContent = text; t.hidden = false;
  ui.toastT = secs;
}

// ---------- actions ----------
function pickTool(kind) {
  if (game.mode !== 'build') return;
  ui.tool = kind && game.left(kind) > 0 ? kind : null;
  ui.chosen = null;
  renderAll();
}
function choose(x, y) { ui.chosen = x == null ? null : { x, y }; refreshFx(); placePieceBar(); }

function placeAt(c) {
  const kind = ui.tool;
  if (!game.place(kind, c.x, c.y, !!flipPref[kind])) return false;
  sfx.place();
  ui.hint = null;
  if (game.left(kind) <= 0) ui.tool = null;
  ui.chosen = { x: c.x, y: c.y };
  renderAll();
  return true;
}
function flipChosen() {
  const c = ui.chosen; if (!c) return;
  const p = game.at(c.x, c.y);
  if (p && game.flip(c.x, c.y)) { flipPref[p.kind] = p.flip; sfx.place(); renderAll(); }
}
function takeBack(x, y) {
  if (game.remove(x, y)) { sfx.take(); if (ui.chosen && ui.chosen.x === x && ui.chosen.y === y) ui.chosen = null; renderAll(); }
}
function release() {
  if (game.mode === 'build') {
    ui.chosen = null; ui.hint = null; ui.drag = null;
    game.release(); sfx.release();
    $('toast').hidden = true;
  } else {
    game.stop();
  }
  renderAll();
}
function goLevel(i) {
  if (!game.unlocked(i)) return;
  ui = { tool: null, chosen: null, drag: null, hover: null, hint: null, hintT: 0, toastT: 0 };
  $('toast').hidden = true;
  game.load(i);
  buildBoard(); buildPieces();
  renderAll();
}
function hint() {
  if (game.mode !== 'build') return;
  const h = game.hint();
  if (!h) { toast('Your pieces already match a three-star run. Release!'); return; }
  ui.hint = h; ui.hintT = 6;
  const name = PIECES[h.kind].name.toLowerCase();
  let line = `Try a ${name} in the cell shown${h.flip ? ', facing left' : ''}.`;
  if (h.wrong) line = `There is a ${PIECES[h.wrong].name.toLowerCase()} where a ${name} would go: see the cell shown.`;
  else if (!h.spare) line = `A ${name} goes in the cell shown, but your ${name}s are all hung somewhere else.`;
  toast(line, 6);
  refreshFx();
}

function onWin(r) {
  sfx.win();
  for (const c of cupGlow) c.back.material.emissive.set('#3a2a06');
  setTimeout(() => showResult(r), 900);
}
function onFail(r) {
  sfx.fail();
  toast(FAIL_WORDS[r.end] || 'Try again.', 2.6);
}
function showResult(r) {
  if (game.mode !== 'won') return;
  const L = game.L;
  const labels = [L.marbles > 1 ? 'Both home' : 'In the cup', L.bells.length ? 'Every bell' : 'No bells here', `Par ${L.par}`];
  $('result-stars').innerHTML = r.stars.map((s, i) =>
    `<div class="${s ? 'got' : ''} ${s && !r.before[i] ? 'new' : ''}"><i></i>${labels[i]}</div>`).join('');
  const missing = [];
  if (!r.stars[1]) missing.push(`ring every bell (${r.bells} of ${L.bells.length} this time)`);
  if (!r.stars[2]) missing.push(`use ${L.par} piece${L.par === 1 ? '' : 's'} or fewer (you used ${r.used})`);
  $('result-line').textContent = missing.length ? `For the other star${missing.length > 1 ? 's' : ''}: ${missing.join(', and ')}.` :
    'Every star on this level. Lovely run.';
  $('result-title').textContent = L.marbles > 1 ? 'Both home!' : 'In the cup!';
  const last = game.idx === game.LEVELS.length - 1;
  $('btn-next').textContent = last ? 'Back to level 1' : 'Next level';
  $('result').hidden = false;
  renderLevel();
}
$('btn-next').addEventListener('click', () => {
  $('result').hidden = true;
  goLevel(game.idx === game.LEVELS.length - 1 ? 0 : game.idx + 1);
});
$('btn-stay').addEventListener('click', () => { $('result').hidden = true; game.stop(); renderAll(); });

$('btn-release').addEventListener('click', release);
$('btn-flip').addEventListener('click', flipChosen);
$('btn-take').addEventListener('click', () => ui.chosen && takeBack(ui.chosen.x, ui.chosen.y));
$('btn-clear').addEventListener('click', () => { if (game.clear()) { ui.chosen = null; ui.hint = null; sfx.take(); renderAll(); } });
$('btn-hint').addEventListener('click', hint);
$('btn-help').addEventListener('click', () => { $('help').hidden = false; });
$('btn-help-close').addEventListener('click', () => { $('help').hidden = true; });
$('help').addEventListener('click', (e) => { if (e.target === $('help')) $('help').hidden = true; });
function renderSound() {
  $('btn-sound').textContent = audio.on ? 'Sound: on' : 'Sound: off';
  $('btn-sound').setAttribute('aria-pressed', audio.on ? 'true' : 'false');
}
$('btn-sound').addEventListener('click', () => { audio.toggle(); renderSound(); if (audio.on) sfx.place(); });
renderSound();
$('help-pieces').innerHTML = ORDER.map((k) => `<li>${iconSvg(k)}<span><b>${PIECES[k].name}.</b> ${PIECES[k].tip}</span></li>`).join('');
$('help-pieces').classList.add('pieces');

// ---------- pointer ----------
canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const c = cellAt(e);
  if (c && c.inside && game.at(c.x, c.y)) takeBack(c.x, c.y);
});
canvas.addEventListener('pointerdown', (e) => {
  if (e.button === 2) return;
  if (game.mode !== 'build') return;
  const c = cellAt(e);
  if (!c) return;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* a synthetic or already-ended pointer */ }
  const p = c.inside ? game.at(c.x, c.y) : null;
  ui.drag = { id: e.pointerId, from: c, to: c, piece: p, moved: false };
});
canvas.addEventListener('pointermove', (e) => {
  const c = cellAt(e);
  if (ui.drag && ui.drag.id === e.pointerId) {
    if (ui.drag.piece && c && (c.x !== ui.drag.from.x || c.y !== ui.drag.from.y)) {
      ui.drag.moved = true; ui.drag.to = c; canvas.classList.add('dragging');
      ui.chosen = null; placePieceBar();
    }
    refreshFx();
    return;
  }
  if (e.pointerType === 'mouse') {
    const was = ui.hover;
    ui.hover = c;
    if (!was || !c || was.x !== c.x || was.y !== c.y) refreshFx();
  }
});
function endDrag(e, cancelled) {
  const d = ui.drag;
  if (!d || d.id !== e.pointerId) return;
  ui.drag = null;
  canvas.classList.remove('dragging');
  if (cancelled || game.mode !== 'build') { refreshFx(); return; }
  const c = cellAt(e) || d.to;
  if (d.piece && d.moved) {
    // dragged: to an empty cell moves it, off the board puts it back in the box
    if (!c.inside) takeBack(d.piece.x, d.piece.y);
    else if (game.move(d.piece.x, d.piece.y, c.x, c.y)) { sfx.place(); ui.chosen = { x: c.x, y: c.y }; }
    renderAll();
    return;
  }
  if (!c.inside) { choose(null); return; }
  if (d.piece) {
    // a tap on a hung piece chooses it; a second tap on the chosen one flips it
    if (ui.chosen && ui.chosen.x === c.x && ui.chosen.y === c.y && !PIECES[d.piece.kind].sym) flipChosen();
    else { ui.tool = null; choose(c.x, c.y); renderBox(); }
    return;
  }
  if (ui.tool && game.canPlace(ui.tool, c.x, c.y)) { placeAt(c); return; }
  if (ui.tool && !canHangHere(c.x, c.y)) toast(game.fixedAt(c.x, c.y) ? 'That piece is part of the level.' : 'Nothing can hang there.', 1.6);
  choose(null);
}
canvas.addEventListener('pointerup', (e) => endDrag(e, false));
canvas.addEventListener('pointercancel', (e) => endDrag(e, true));
canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !ui.drag) { ui.hover = null; refreshFx(); } });

// ---------- keys ----------
window.addEventListener('keydown', (e) => {
  if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
  if (!$('help').hidden || !$('result').hidden) {
    if (e.key === 'Escape' || e.key === 'Enter') { $('help').hidden = true; if (!$('result').hidden) $('btn-stay').click(); e.preventDefault(); }
    return;
  }
  if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); release(); }
  else if (e.key === 'f' || e.key === 'F') flipChosen();
  else if (e.key === 'Delete' || e.key === 'Backspace') { if (ui.chosen) { e.preventDefault(); takeBack(ui.chosen.x, ui.chosen.y); } }
  else if (e.key === 'h' || e.key === 'H') hint();
  else if (e.key === 'Escape') { ui.tool = null; choose(null); renderAll(); }
  else if (/^[1-8]$/.test(e.key)) {
    const kinds = ORDER.filter((k) => (game.L.give[k] || 0) > 0);
    const k = kinds[+e.key - 1];
    if (k) pickTool(ui.tool === k ? null : k);
  }
});

// ---------- rolling noise ----------
// One looped noise through a band-pass, louder and higher the faster the marbles roll.
let roll = null;
whenUnlocked((ctx) => {
  const len = ctx.sampleRate;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) { last = last * 0.92 + (Math.random() * 2 - 1) * 0.08; d[i] = last * 6; }
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 0.8;
  const g = ctx.createGain(); g.gain.value = 0;
  src.connect(f).connect(g).connect(audio.out());
  src.start();
  roll = { f, g, ctx };
});
function updateRoll() {
  if (!roll) return;
  let s = 0;
  if (game.mode === 'run' && audio.on) for (const m of game.world.marbles) if (m.live && m.contact) s += Math.hypot(m.vx, m.vy);
  const t = roll.ctx.currentTime;
  roll.g.gain.setTargetAtTime(clamp(s * 0.03, 0, 0.12), t, 0.05);
  roll.f.frequency.setTargetAtTime(300 + clamp(s, 0, 6) * 160, t, 0.05);
}

// ---------- the loop ----------
let last = performance.now();
function render() {
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (game.world !== shownWorld) { buildPieces(); renderRun(); }
  stepTilts(dt);
  // toggles swing to the state they are in; springs give a little after a bounce
  game.world.pieces.forEach((p, i) => {
    const g = pieceMeshes[i];
    if (!g) return;
    if (g.userData.flap) {
      const to = p.state * FLAP_SWING * g.userData.sign;
      const f = g.userData.flap;
      f.rotation.z += (to - f.rotation.z) * Math.min(1, dt * 14);
    }
    if (g.userData.pad && g.userData.boing) {
      g.userData.boing = Math.max(0, g.userData.boing - dt * 3);
      g.userData.pad.position.z = DEPTH * 0.48 + Math.sin(g.userData.boing * 20) * 0.02 * g.userData.boing;
      g.userData.pad.scale.y = 0.04 * (1 + g.userData.boing * 0.6);
    }
  });
  for (const b of bells) {
    if (b.swing > 0.001) {
      b.t += dt;
      b.swing *= Math.exp(-dt * 1.6);
      b.hang.rotation.z = Math.sin(b.t * 11) * b.swing;
    }
  }
  if (game.world.marbles) {
    for (const m of game.world.marbles) {
      if (m.home && m.cup) { const c = cupGlow.find((q) => q.c === m.cup); if (c) c.back.material.emissive.set('#3a2a06'); }
    }
  }
  syncMarbles();
  if (ui.hintT > 0) {
    ui.hintT -= dt;
    mat.hint.opacity = 0.35 + 0.25 * Math.sin(now / 160);
    if (ui.hintT <= 0) { ui.hint = null; refreshFx(); }
  }
  if (ui.toastT > 0) { ui.toastT -= dt; if (ui.toastT <= 0) $('toast').hidden = true; }
  updateRoll();
  if (game.mode !== lastMode) { lastMode = game.mode; renderAll(); }
  renderer.render(scene, camera);
}
let lastMode = game.mode;
const loop = fixedLoop({ step: (dt) => game.step(dt), render, hz: 60 });

buildBoard();
buildPieces();
renderAll();
loop.start();
if (!game.store.seenHelp) { game.store.seenHelp = true; save.save(game.store); }

// ---------- debug handle ----------
expose('__run', {
  game, scene, camera, renderer, loop,
  get mode() { return game.mode; },
  get ui() { return ui; },
  goLevel, release, hint, pickTool, placeAt: (x, y) => placeAt({ x, y, inside: true }),
  // run the sim n steps straight away, for tests that cannot wait on the clock
  step(n = 1) { for (let i = 0; i < n; i++) game.step(DT); render(); return game.mode; },
  solve() { game.setLayout(game.L.solution); renderAll(); return game.placed.length; },
  render,
  text: () => game.text(),
});
