/* Marble Run: the page. The pegboard in three.js (vendored), the box of pieces and the
   level list in HTML beside it, sound, the store, and the debug handle (window.__run).

   The sim works in cells with y up and the marble rolling in the plane of the board, so
   the scene uses the same numbers: one cell is one unit, the board's face is z = 0 and
   every piece stands out from it towards the camera. A marble's centre is at z = MZ, in the
   middle of a rail's depth, and it turns about z, which is how a marble rolling along a
   rail on a wall really turns. Everything here is drawn from the same lines the physics
   collides with (layout() and FITTINGS), so what you see is what the marble hits. */
import * as THREE from 'three';
import { createRun, PIECES, FITTINGS, R, T, DT, FRAME, MOTOR_W, PIPE_R, CRUMBLE_GONE, pieceLines, layout, feederDir } from './sim.js';
import { store } from '../lib/save.js';
import { createAudio, whenUnlocked } from '../lib/audio.js';
import { fixedLoop } from '../lib/loop.js';
import { expose } from '../lib/debug.js';

// ---------- constants ----------
const DEPTH = 0.36;               // how far a rail stands out from the board
const FRAME_W = 0.5;              // the frame's width round the board, room for its iron corners
const FRAME_D = 0.95;             // its depth: deep enough that the pipes and tubes go in under it (Amber)
const ROLL_QUIET = 0.8;           // cells/s: slower than this, a rolling marble makes no sound
const MZ = 0.19;                  // the marble's centre, out from the board
const FOV = 26;
const MARBLE_COLOURS = [
  { base: '#24508f', deep: '#14305e', metal: '#e4e8ee' },   // blue enamel, silver filigree
  { base: '#8f2a3c', deep: '#5a1422', metal: '#f0cc74' },   // garnet, gold filigree
];
const FLAP_SWING = 102.2 * Math.PI / 180;   // a toggle's flap swings this far between its two lines
const FLAP_PIVOT = [0.5, 0.559];            // where both of its lines cross
const ORDER = ['feeder', 'starter', 'slopehigh', 'slope', 'steep', 'turn', 'funnel', 'stop', 'jump', 'spring', 'toggle', 'wheel', 'motor', 'chime', 'bucket',
  'seesaw', 'spiral', 'flipper', 'catapult', 'flap', 'crumble', 'plinko', 'booster', 'bumper'];
const CHIME_NOTES = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760];   // a pentatonic run, by the row a chime hangs in
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
  bell(freq = 1318) {
    audio.tone({ freq, dur: 1.4, type: 'sine', vol: 0.07 });
    audio.tone({ freq: freq * 1.5, dur: 0.9, type: 'sine', vol: 0.03 });
    audio.tone({ freq: freq * 2.5, dur: 0.4, type: 'sine', vol: 0.015 });
  },
  cup() {
    audio.tone({ freq: 880, to: 700, dur: 0.12, type: 'triangle', vol: 0.08 });
    [784, 988, 1175].forEach((f, i) => audio.tone({ freq: f, dur: 0.5, type: 'sine', vol: 0.05, delay: 0.08 + i * 0.09 }));
  },
  spring() { audio.tone({ freq: 160, to: 520, dur: 0.28, type: 'sine', vol: 0.09 }); },
  bump() { audio.tone({ freq: 700, to: 1400, dur: 0.12, type: 'square', vol: 0.04 }); audio.tone({ freq: 1400, dur: 0.15, type: 'sine', vol: 0.04, delay: 0.03 }); },
  kick() { audio.tone({ freq: 220, to: 90, dur: 0.12, type: 'triangle', vol: 0.1 }); audio.noise({ dur: 0.05, vol: 0.04, filter: 'bandpass', freq: 1200, q: 1 }); },
  crumble() { audio.noise({ dur: 0.35, vol: 0.06, filter: 'lowpass', freq: 900, q: 0.7 }); audio.tone({ freq: 140, to: 70, dur: 0.25, type: 'triangle', vol: 0.06 }); },
  whirl() { audio.tone({ freq: 500, to: 900, dur: 0.5, type: 'sine', vol: 0.03 }); },
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
    else if (ev === 'bell') { sfx.bell(d.chime ? CHIME_NOTES[d.y % CHIME_NOTES.length] : undefined); ringBell(d.x, d.y); }
    else if (ev === 'cup') { sfx.cup(); if (d.bucket) renderSandbox(); }
    else if (ev === 'spring') { sfx.spring(); bounceSpring(d.piece); }
    else if (ev === 'toggle') sfx.toggle();
    else if (ev === 'bump') { sfx.bump(); bounceSpring(d.piece); }
    else if (ev === 'kick') sfx.kick();
    else if (ev === 'crumble') sfx.crumble();
    else if (ev === 'mend') sfx.place();
    else if (ev === 'spiral') sfx.whirl();
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
/* Her third reference (2026-10-16), steampunk: a weathered oak board with iron corner
   brackets and brass filigree, rails that are dark wooden beams capped in toothed brass on
   brass brackets, a glass bowl on a copper stand for the cup, chimes for bells, copper pipes
   and gauges where nothing can hang, and a filigree marble. */
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
// Brass scrollwork for a corner of the frame: curls along both edges into the corner,
// transparent round them. Drawn for the top-left corner; the others are the same, turned.
function filigreeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.lineCap = 'round';
  const curl = (x, y, r, a0, turns, dir) => {
    g.beginPath();
    for (let k = 0; k <= 60; k++) {
      const t = k / 60, a = a0 + dir * t * turns * Math.PI * 2, rr = r * (1 - t * 0.8);
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (k) g.lineTo(px, py); else g.moveTo(px, py);
    }
    g.stroke();
  };
  const draw = () => {
    g.beginPath(); g.moveTo(20, 236); g.quadraticCurveTo(20, 20, 236, 20); g.stroke();
    g.beginPath(); g.moveTo(52, 200); g.quadraticCurveTo(52, 52, 200, 52); g.stroke();
    curl(200, 80, 26, -Math.PI / 2, 1.3, 1);
    curl(80, 200, 26, Math.PI, 1.3, -1);
    curl(120, 120, 30, Math.PI * 0.75, 1.4, 1);
    curl(150, 92, 16, 0, 1.2, -1);
    curl(92, 150, 16, Math.PI / 2, 1.2, 1);
    for (const [x, y] of [[236, 20], [20, 236], [92, 92]]) { g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); }
  };
  g.strokeStyle = 'rgba(40,24,4,0.6)'; g.fillStyle = 'rgba(40,24,4,0.6)'; g.lineWidth = 11;
  g.save(); g.translate(2, 3); draw(); g.restore();                   // its shadow on the wood
  const gr = g.createLinearGradient(0, 0, 256, 256);
  gr.addColorStop(0, '#fbe3a0'); gr.addColorStop(0.5, '#b8862f'); gr.addColorStop(1, '#e6c070');
  g.strokeStyle = gr; g.fillStyle = gr; g.lineWidth = 8;
  draw();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const mat = {
  board: new THREE.MeshStandardMaterial({ map: woodTex('assets/oak.jpg'), roughness: 0.7, color: '#e6d6c4' }),
  frame: new THREE.MeshStandardMaterial({ map: woodTex('assets/oak.jpg'), roughness: 0.6, color: '#a89480' }),
  iron: new THREE.MeshStandardMaterial({ color: '#3d3b39', metalness: 0.75, roughness: 0.55 }),
  rivet: new THREE.MeshStandardMaterial({ color: '#77736e', metalness: 0.9, roughness: 0.35 }),
  filigree: new THREE.MeshStandardMaterial({ map: filigreeTexture(), transparent: true, metalness: 0.6, roughness: 0.35, depthWrite: false, side: THREE.DoubleSide }),
  copper: new THREE.MeshStandardMaterial({ color: '#c8764a', metalness: 0.95, roughness: 0.3 }),
  copperDouble: new THREE.MeshStandardMaterial({ color: '#c8764a', metalness: 0.95, roughness: 0.3, side: THREE.DoubleSide }),
  // rails: a dark wooden beam under a brass cap; the level's own in darker wood and bronze
  beam: new THREE.MeshStandardMaterial({ map: woodTex('assets/beam.jpg'), roughness: 0.6, color: '#8a6e5c' }),
  beamDark: new THREE.MeshStandardMaterial({ map: woodTex('assets/beam.jpg'), roughness: 0.6, color: '#4a3a30' }),
  glass: new THREE.MeshPhysicalMaterial({ color: '#ffffff', metalness: 0, roughness: 0.03, transparent: true, opacity: 0.22, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.6 }),
  walnut: new THREE.MeshStandardMaterial({ color: '#c99a45', metalness: 0.9, roughness: 0.32 }),     // brackets: brass
  crate: new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.6 }),
  crateSide: new THREE.MeshStandardMaterial({ color: '#4a4440', metalness: 0.6, roughness: 0.5 }),
  // the level's own pieces: dark bronze, so they read as fixed beside your bright brass
  stained: new THREE.MeshStandardMaterial({ color: '#7a5634', metalness: 0.85, roughness: 0.4 }),
  beech: new THREE.MeshStandardMaterial({ color: '#e8bc5c', metalness: 0.95, roughness: 0.22 }),   // your pieces: bright brass
  brass: new THREE.MeshStandardMaterial({ color: '#d8a948', metalness: 0.92, roughness: 0.3 }),
  grommet: new THREE.MeshStandardMaterial({ color: '#c9973e', metalness: 0.95, roughness: 0.3 }),
  rubber: new THREE.MeshStandardMaterial({ color: '#b8332a', roughness: 0.75 }),
  hole: new THREE.MeshBasicMaterial({ color: '#1a0f07' }),
  bellCell: new THREE.MeshBasicMaterial({ color: '#e8b94e', transparent: true, opacity: 0.1, depthWrite: false }),
  cellOk: new THREE.MeshBasicMaterial({ color: '#f6d58c', transparent: true, opacity: 0.08, depthWrite: false }),
  ghost: new THREE.MeshStandardMaterial({ color: '#ffe2a8', transparent: true, opacity: 0.5, roughness: 0.6, depthWrite: false }),
  ghostFaint: new THREE.MeshStandardMaterial({ color: '#ffe2a8', transparent: true, opacity: 0.28, roughness: 0.6, depthWrite: false }),
  ghostBad: new THREE.MeshStandardMaterial({ color: '#ff8a7a', transparent: true, opacity: 0.4, roughness: 0.6, depthWrite: false }),
  hint: new THREE.MeshStandardMaterial({ color: '#9ff0a8', transparent: true, opacity: 0.55, roughness: 0.6, depthWrite: false, emissive: '#2f6a34' }),
  chosen: new THREE.MeshBasicMaterial({ color: '#ffd77a', transparent: true, opacity: 0.22, depthWrite: false }),
};

// A filigree ball, as in her reference: enamel with two bands of metal round it and curls of
// metal wire between, so its turning shows from any side. The colour map carries the
// pattern; a metalness map makes only the wire shine like metal.
function marbleTexture(col, seed) {
  const make = (paint) => {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    paint(c.getContext('2d'));
    const t = new THREE.CanvasTexture(c);
    return t;
  };
  const wire = (g, colour) => {
    g.strokeStyle = colour; g.fillStyle = colour; g.lineCap = 'round';
    for (const y of [86, 170]) { g.lineWidth = 9; g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
    g.lineWidth = 4;
    for (let i = 0; i < 10; i++) {
      for (const [y0, dir] of [[128, 1], [40, -1], [214, 1]]) {
        const x = i * 51.2 + (y0 === 128 ? 0 : 25.6), r = y0 === 128 ? 22 : 15;
        g.beginPath();
        for (let k = 0; k <= 40; k++) {
          const t = k / 40, a = seed + dir * t * Math.PI * 3.2, rr = r * (1 - t * 0.75);
          const px = x + Math.cos(a) * rr, py = y0 + Math.sin(a) * rr;
          if (k) g.lineTo(px, py); else g.moveTo(px, py);
        }
        g.stroke();
      }
    }
  };
  const map = make((g) => {
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, col.deep); gr.addColorStop(0.5, col.base); gr.addColorStop(1, col.deep);
    g.fillStyle = gr; g.fillRect(0, 0, 512, 256);
    wire(g, col.metal);
  });
  map.colorSpace = THREE.SRGBColorSpace;
  const metal = make((g) => { g.fillStyle = '#202020'; g.fillRect(0, 0, 512, 256); wire(g, '#ffffff'); });
  return { map, metal };
}
const marbleMats = MARBLE_COLOURS.map((col, i) => {
  const { map, metal } = marbleTexture(col, i * 1.7);
  return new THREE.MeshPhysicalMaterial({
    map, metalnessMap: metal, metalness: 1, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.05,
  });
});
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
/* A piece's rails as in her reference: a shallow rail is a dark wooden beam hanging under a
   brass cap whose top is exactly where the marble rolls, with a row of brass teeth along
   its back edge; a steep one (a turn's wall, a funnel's side, a post) is the beam alone,
   brass on its front face. The lines are the same ones the physics uses. */
const toothGeo = new THREE.BoxGeometry(0.03, 0.04, 0.05);
function railGroup(lines, ox, oy, brass, wood) {
  const g = new THREE.Group();
  for (const l of lines) {
    for (let k = 0; k + 1 < l.length; k++) {
      const ax = ox + l[k][0], ay = oy + l[k][1], bx = ox + l[k + 1][0], by = oy + l[k + 1][1];
      const len = Math.hypot(bx - ax, by - ay), ang = Math.atan2(by - ay, bx - ax);
      let nx = -(by - ay) / len, ny = (bx - ax) / len;
      if (ny < 0) { nx = -nx; ny = -ny; }
      if (Math.abs(by - ay) > Math.abs(bx - ax) * 1.2) {
        g.add(railMesh(ax, ay, bx, by, wood, DEPTH, 2 * T + 0.02));
        const face = railMesh(ax, ay, bx, by, brass, 0.02, 2 * T + 0.024);
        face.position.z = DEPTH; g.add(face);
        continue;
      }
      // the cap's top sits at the line + T, like the rail the marble touches
      const off = (d) => [ax + nx * d, ay + ny * d, bx + nx * d, by + ny * d];
      const cap = railMesh(...off(T - 0.016), brass, DEPTH + 0.01, 0.032);
      const beam = railMesh(...off(T - 0.032 - 0.065), wood, DEPTH * 0.92, 0.13);
      g.add(cap, beam);
      const n = Math.max(1, Math.floor(len / 0.075));
      const teeth = new THREE.InstancedMesh(toothGeo, brass, n);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), ang);
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n;
        m4.compose(new THREE.Vector3(ax + (bx - ax) * u + nx * (T + 0.02), ay + (by - ay) * u + ny * (T + 0.02), 0.025), q, new THREE.Vector3(1, 1, 1));
        teeth.setMatrixAt(i, m4);
      }
      teeth.castShadow = true;
      g.add(teeth);
    }
    for (const [x, y] of l) g.add(jointMesh(ox + x, oy + y, brass, DEPTH + 0.01));
  }
  return g;
}
// A brass screw where the piece hangs on the board, and the bracket under the rail it
// goes through: a small gunmetal plate on the board with a screw head showing below.
function screw(x, y) {
  const g = new THREE.Group();
  // an L of brass: a plate on the board and a shelf out under the beam
  const tab = new THREE.Mesh(boxGeo, mat.walnut);
  tab.scale.set(0.12, 0.2, 0.03); tab.position.set(x, y - 0.2, 0.015);
  tab.receiveShadow = true; tab.castShadow = true;
  const shelf = new THREE.Mesh(boxGeo, mat.walnut);
  shelf.scale.set(0.12, 0.025, DEPTH * 0.7); shelf.position.set(x, y - 0.17, DEPTH * 0.35);
  shelf.castShadow = true;
  g.add(shelf);
  const head = new THREE.Mesh(pinGeo, mat.brass);
  head.scale.set(0.032, 0.032, 0.02); head.position.set(x, y - 0.24, 0.04);
  const m = new THREE.Mesh(pinGeo, mat.brass);
  m.scale.set(0.035, 0.035, 0.02);
  m.position.set(x, y, DEPTH + 0.01);
  g.add(tab, head, m);
  return g;
}

/* The sandbox's wheels: paddles round a hub, built at angle 0 in a group at the cell's middle
   that the render loop turns. A paddle wheel has a thin brass rim behind its paddles; a
   motor wheel an iron gear behind its copper scoops, turning with them. */
const gearGeo = (() => {
  const sh = new THREE.Shape();
  const n = 14;
  for (let k = 0; k < n * 2; k++) {
    const a = (k / (n * 2)) * Math.PI * 2, r = k % 2 ? 0.34 : 0.4;
    const a0 = a - Math.PI / (n * 2) * 0.6, a1 = a + Math.PI / (n * 2) * 0.6;
    if (!k) sh.moveTo(Math.cos(a0) * r, Math.sin(a0) * r); else sh.lineTo(Math.cos(a0) * r, Math.sin(a0) * r);
    sh.lineTo(Math.cos(a1) * r, Math.sin(a1) * r);
  }
  const hole = new THREE.Path(); hole.absarc(0, 0, 0.2, 0, Math.PI * 2, true);
  sh.holes.push(hole);
  return new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: false });
})();
function wheelGroup(p, material) {
  const g = new THREE.Group();
  const spinner = new THREE.Group();
  spinner.position.set(p.x + 0.5, p.y + 0.5, 0);
  const lines = pieceLines(p.kind, p.flip, 0).map((l) => l.map(([x, y]) => [x - 0.5, y - 0.5]));
  const motor = p.kind === 'motor';
  spinner.add(linesGroup(lines, 0, 0, motor && material === mat.beech ? mat.copper : material));
  if (motor) {
    const gear = new THREE.Mesh(gearGeo, mat.iron);
    gear.position.z = 0.01; gear.castShadow = true; gear.receiveShadow = true;
    spinner.add(gear);
  } else {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.016, 8, 40), material);
    rim.position.z = 0.03; rim.castShadow = true;
    spinner.add(rim);
  }
  const hub = new THREE.Mesh(pinGeo, mat.brass);
  hub.scale.set(0.09, 0.09, DEPTH + 0.05); hub.position.z = (DEPTH + 0.05) / 2;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), motor ? mat.copper : mat.brass);
  cap.position.z = DEPTH + 0.05;
  spinner.add(hub, cap);
  g.add(spinner);
  g.userData.spin = { spinner, sgn: p.flip ? -1 : 1, idle: 0 };
  return g;
}

/* The sandbox's moving parts that swing about a pivot (see-saw, flipper, catapult): built at
   angle 0 in a group at the pivot, which the render loop turns to the piece's angle. */
const pivotOf = (p) => { const pv = PIECES[p.kind].pivot; return [p.x + (p.flip ? 1 - pv[0] : pv[0]), p.y + pv[1]]; };
function swingGroup(p, material) {
  const g = new THREE.Group();
  const [px, py] = pivotOf(p);
  const spinner = new THREE.Group();
  spinner.position.set(px, py, 0);
  const lines = pieceLines(p.kind, p.flip, 0).map((l) => l.map(([x, y]) => [x - (px - p.x), y - (py - p.y)]));
  if (p.kind === 'seesaw') {
    spinner.add(railGroup(lines, 0, 0, material, mat.beam));
    // the fulcrum: a brass wedge down to the board's peg below
    const wedge = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.13, 0.3, 3), mat.brass);
    wedge.position.set(px, py - 0.16, DEPTH / 2); wedge.scale.z = DEPTH * 2.4; wedge.castShadow = true;
    g.add(wedge);
  } else if (p.kind === 'flipper') {
    const bat = linesGroup(lines, 0, 0, mat.rubber, DEPTH);
    bat.scale.set(1, 2.2, 1);
    spinner.add(bat);
  } else {
    spinner.add(linesGroup(lines, 0, 0, material));
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.015, 6, 18), mat.iron);
    coil.position.set(0, -0.02, DEPTH / 2); spinner.add(coil);
  }
  const cap = new THREE.Mesh(pinGeo, mat.brass);
  cap.scale.set(0.06, 0.06, DEPTH + 0.06); cap.position.set(px, py, (DEPTH + 0.06) / 2);
  g.add(spinner, cap);
  g.userData.spin = { spinner, sgn: p.flip ? -1 : 1, idle: 0 };
  return g;
}
// The spiral: a brass pole and a corkscrew track round it, out from the board, that a
// marble rides down (sim.js moves it; m.rz brings it forward).
function spiralGroup(p) {
  const g = new THREE.Group();
  const cz = MZ + 0.26, pts = [];
  for (let k = 0; k <= 96; k++) {
    const u = k / 96, phi = u * 4 * Math.PI;
    pts.push(new THREE.Vector3(p.x + 0.5 + Math.sin(phi) * 0.26, p.y + 0.86 - 0.72 * u - R - 0.02, MZ + 0.26 * (1 - Math.cos(phi))));
  }
  const track = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 160, 0.025, 8, false), mat.brass);
  track.castShadow = true;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.95, 12), mat.copper);
  pole.position.set(p.x + 0.5, p.y + 0.48, cz); pole.castShadow = true;
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 8, 24), mat.brass);
  mouth.rotation.x = Math.PI / 2; mouth.position.set(p.x + 0.5, p.y + 0.9, MZ + 0.1);
  const bracket = new THREE.Mesh(boxGeo, mat.walnut);
  bracket.scale.set(0.1, 0.06, cz); bracket.position.set(p.x + 0.5, p.y + 0.95, cz / 2);
  const foot = bracket.clone(); foot.position.y = p.y + 0.02;
  g.add(track, pole, mouth, bracket, foot);
  return g;
}
function pinsGroup(p) {
  const g = new THREE.Group();
  for (const [[x, y]] of pieceLines('plinko', false, 0)) {
    const pin = new THREE.Mesh(pinGeo, mat.brass);
    pin.scale.set(T, T, DEPTH); pin.position.set(p.x + x, p.y + y, DEPTH / 2); pin.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), mat.brass);
    head.position.set(p.x + x, p.y + y, DEPTH);
    g.add(pin, head);
  }
  return g;
}
// Four bricks on the ledge's line; the render loop shakes them, lets them fall and brings
// them back (p.crumble and p.timer from sim.js).
const brickMat = new THREE.MeshStandardMaterial({ color: '#a4583a', roughness: 0.85 });
function crumbleGroup(p) {
  const g = new THREE.Group();
  const bricks = [];
  for (let k = 0; k < 4; k++) {
    const b = new THREE.Mesh(boxGeo, brickMat);
    b.scale.set(0.21, 0.13, DEPTH * 0.9);
    const home = new THREE.Vector3(p.x + 0.155 + k * 0.23, p.y + 0.5 + T - 0.065, DEPTH * 0.45);
    b.position.copy(home); b.castShadow = true; b.receiveShadow = true;
    b.userData.home = home; b.userData.spin = (k % 2 ? 1 : -1) * (1.5 + k * 0.7); b.userData.drift = (k - 1.5) * 0.25;
    g.add(b); bricks.push(b);
  }
  g.userData.bricks = bricks;
  return g;
}
function bumperGroup(p) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, DEPTH * 0.9, 28), new THREE.MeshStandardMaterial({ color: '#b8332a', roughness: 0.35, emissive: '#000000' }));
  body.rotation.x = Math.PI / 2; body.position.set(p.x + 0.5, p.y + 0.5, DEPTH * 0.45); body.castShadow = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.03, 8, 28), mat.brass);
  ring.position.set(p.x + 0.5, p.y + 0.5, DEPTH * 0.9);
  const top = new THREE.Mesh(new THREE.CircleGeometry(0.15, 24), new THREE.MeshStandardMaterial({ color: '#f3ead8', roughness: 0.4 }));
  top.position.set(p.x + 0.5, p.y + 0.5, DEPTH * 0.9 + 0.002);
  g.add(body, ring, top);
  g.userData.bumper = body;
  return g;
}
function boosterGroup(p, material) {
  const g = new THREE.Group();
  const lines = pieceLines('booster', p.flip, 0);
  g.add(railGroup(lines, p.x, p.y, material, mat.beam));
  // three copper chevrons on its face that light up in turn, downhill
  const [[ax, ay], [bx, by]] = lines[0];
  const lights = [];
  for (let k = 0; k < 3; k++) {
    const u = 0.25 + k * 0.25;
    const l = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: '#ff9a3c', emissive: '#ff6a00', emissiveIntensity: 0.2 }));
    l.scale.set(0.08, 0.04, 0.02);
    l.position.set(p.x + ax + (bx - ax) * u, p.y + ay + (by - ay) * u - 0.08, DEPTH * 0.93);
    l.rotation.z = Math.atan2(by - ay, bx - ax);
    g.add(l); lights.push(l);
  }
  g.add(screw(p.x + 0.5, p.y + (ay + by) / 2));
  g.userData.lights = lights;
  return g;
}

// A marble release: a glass tube from the edge of the board (in under the frame) to the
// cell, with a copper mouth where the marbles come out.
function feederGroup(p) {
  const g = new THREE.Group();
  const L = game.L, dir = feederDir(L, p), pad = FRAME, far = pad + FRAME_W * 0.6;
  const tubeMat = mat.glass;
  let tube, mouth;
  if (dir === 'down') {
    const len = L.h + far - (p.y + 0.6);
    tube = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.03, R + 0.03, len, 28, 1, true), tubeMat);
    tube.position.set(p.x + 0.5, p.y + 0.6 + len / 2, MZ);
    mouth = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.06, R + 0.06, 0.07, 24, 1, true), mat.copper);
    mouth.position.set(p.x + 0.5, p.y + 0.6, MZ);
  } else {
    const right = dir === 'right';
    const from = right ? -far : L.w + far, to = p.x + (right ? 0.4 : 0.6), len = Math.abs(to - from);
    tube = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.03, R + 0.03, len, 28, 1, true), tubeMat);
    tube.rotation.z = Math.PI / 2; tube.position.set((from + to) / 2, p.y + 0.5, MZ);
    mouth = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.06, R + 0.06, 0.07, 24, 1, true), mat.copper);
    mouth.rotation.z = Math.PI / 2; mouth.position.set(to, p.y + 0.5, MZ);
  }
  mouth.material = mat.copperDouble;
  g.add(tube, mouth);
  return g;
}

function pieceGroup(p, material) {
  if (p.kind === 'feeder') return feederGroup(p);
  if (p.kind === 'starter') {
    const g = new THREE.Group();
    g.add(railGroup(pieceLines('starter', p.flip), p.x, p.y, material, p.fixed ? mat.beamDark : mat.beam));
    g.add(screw(p.x + (p.flip ? 0.4 : 0.6), p.y + 0.57));
    return g;
  }
  if (p.kind === 'wheel' || p.kind === 'motor') return wheelGroup(p, material);
  if (p.kind === 'seesaw' || p.kind === 'flipper' || p.kind === 'catapult') return swingGroup(p, material);
  if (p.kind === 'spiral') return spiralGroup(p);
  if (p.kind === 'plinko') return pinsGroup(p);
  if (p.kind === 'bumper') return bumperGroup(p);
  if (p.kind === 'crumble') return crumbleGroup(p);
  if (p.kind === 'booster') return boosterGroup(p, material);
  if (p.kind === 'chime') return chimeGroup(p.x, p.y, (p.x + p.y) % 2 === 0);
  if (p.kind === 'bucket') return glassCup(p.x, p.y, 0.28);
  const g = new THREE.Group();
  if (p.kind === 'toggle') {
    // the flap swings about its pivot: built at state 0, turned to the state it is in
    const [l] = pieceLines('toggle', p.flip, 0);
    const px = p.flip ? 1 - FLAP_PIVOT[0] : FLAP_PIVOT[0], py = FLAP_PIVOT[1];
    const flap = new THREE.Group();
    flap.position.set(p.x + px, p.y + py, 0);
    // all brass, not a beam under a brass cap: once it flips, its other face is the one
    // marbles land on, and both faces should look usable (Amber)
    flap.add(linesGroup([l.map(([x, y]) => [x - px, y - py])], 0, 0, material));
    const pin = new THREE.Mesh(pinGeo, mat.brass);
    pin.scale.set(0.05, 0.05, DEPTH + 0.06); pin.position.set(0, 0, (DEPTH + 0.06) / 2);
    flap.add(pin);
    g.add(flap);
    g.userData.flap = flap;
    g.userData.sign = p.flip ? -1 : 1;
    return g;
  }
  g.add(railGroup(p.lines || pieceLines(p.kind, p.flip), p.x, p.y, material, p.fixed ? mat.beamDark : mat.beam));
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
let tubeAt = null;                        // the foot of the glass feed tube, if the level has one
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
  // the board itself, and an oak frame round it, which the marble hits
  const board = new THREE.Mesh(new THREE.BoxGeometry(w + pad * 2, h + pad * 2, 0.3), mat.board);
  board.position.set(w / 2, h / 2, -0.15);
  board.receiveShadow = true;
  // one sheet of her oak, its knots about five cells apart
  mat.board.map.repeat.set((w + pad * 2) / 6, (h + pad * 2) / 6);
  mat.frame.map.repeat.set(1.5, 1.5);
  boardGroup.add(board);
  const fw = FRAME_W;
  for (const [x, y, sx, sy] of [
    [w / 2, -pad - fw / 2, w + 2 * pad + 2 * fw, fw], [w / 2, h + pad + fw / 2, w + 2 * pad + 2 * fw, fw],
    [-pad - fw / 2, h / 2, fw, h + 2 * pad], [w + pad + fw / 2, h / 2, fw, h + 2 * pad],
  ]) {
    const f = new THREE.Mesh(boxGeo, mat.frame);
    f.scale.set(sx, sy, FRAME_D); f.position.set(x, y, FRAME_D / 2 - 0.25);
    f.castShadow = true; f.receiveShadow = true;
    boardGroup.add(f);
  }
  // iron brackets over the frame's corners, riveted, and brass scrollwork inside each
  const ox = -pad - fw, oy = -pad - fw, ex = w + pad + fw, ey = h + pad + fw;
  const arm = 1.1, bw = 0.24, top = FRAME_D - 0.24;
  const rivetGeo = new THREE.SphereGeometry(0.035, 10, 8);
  for (const [cx, cy, sx, sy] of [[ox, oy, 1, 1], [ex, oy, -1, 1], [ox, ey, 1, -1], [ex, ey, -1, -1]]) {
    for (const [lx, ly] of [[arm, bw], [bw, arm]]) {
      const b = new THREE.Mesh(boxGeo, mat.iron);
      b.scale.set(lx, ly, 0.06); b.position.set(cx + sx * lx / 2, cy + sy * ly / 2, top);
      b.castShadow = true; b.receiveShadow = true;
      boardGroup.add(b);
    }
    for (const [u, v] of [[0.12, 0.12], [0.45, 0.12], [0.85, 0.12], [0.12, 0.45], [0.12, 0.85]]) {
      const r = new THREE.Mesh(rivetGeo, mat.rivet);
      r.position.set(cx + sx * u, cy + sy * v, top + 0.03);
      boardGroup.add(r);
    }
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.85), mat.filigree);
    f.scale.set(sx, -sy, 1);                       // the texture is drawn for the top-left corner
    f.position.set(cx + sx * (0.3 + 0.425), cy + sy * (0.3 + 0.425), top - 0.008);
    boardGroup.add(f);
  }
  // brass grommets at the cell corners, so the grid you hang pieces on reads at a glance,
  // except where no cell beside them can take a piece
  const spots = [];
  const open = (x, y) => x >= 0 && y >= 0 && x < w && y < h && !['nope', 'stand', 'pipe', 'tube'].includes(L.cells[y * w + x]);
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
  plumbing(L);
  // cells nothing can hang in have no peg holes (a pipe drawn over them looked solid, and
  // marbles passed through it); bell cells: a faint brass wash
  for (let i = 0; i < L.cells.length; i++) {
    const x = i % w, y = Math.floor(i / w), c = L.cells[i];
    if (c === 'bell') {
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
  // the hopper: a copper ledge, fed by a glass tube down through the frame when it is on
  // the top row; the marbles still to come wait in the tube, where you can see them
  const S = L.start;
  tubeAt = null;
  // the hopper's ledge looks like the other slopes: a beam under a brass cap (Amber)
  if (S) boardGroup.add(railGroup(FITTINGS.start().map((l) => l.map(([x, y]) => [S.flip ? 1 - x : x, y])), S.x, S.y, mat.beech, mat.beam));
  if (S) {
    const px = S.x + (S.flip ? 1 - 0.32 : 0.32);
    const foot = S.y + 1, len = h - foot + pad + fw * 0.6;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.03, R + 0.03, len, 28, 1, true), mat.glass);
    tube.position.set(px, foot + len / 2, MZ);
    const mouth = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.06, R + 0.06, 0.07, 24, 1, true), mat.copper);
    mouth.position.set(px, foot + 0.035, MZ);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.06, R + 0.06, 0.08, 24, 1, true), mat.copper);
    collar.position.set(px, h + pad - 0.04, MZ);
    for (const m of [mouth, collar]) { m.material.side = THREE.DoubleSide; m.castShadow = true; }
    boardGroup.add(tube, mouth, collar);
    tubeAt = { x: px, y: foot };
    // brass clips holding the tube to the board, one per cell it passes
    for (let y = foot + 0.5; y < h; y += 1) {
      const clip = new THREE.Mesh(new THREE.TorusGeometry(R + 0.045, 0.018, 8, 24), mat.brass);
      clip.rotation.x = Math.PI / 2; clip.position.set(px, y, MZ); boardGroup.add(clip);
    }
  }
  // cups: a glass bowl on a copper column, its rim a copper ring that glows when it is full
  cupGlow = [];
  for (const c of L.cups) {
    const cup = glassCup(c.x, c.y, c.y + pad + fw * 0.5);   // its column runs down to the frame
    boardGroup.add(cup);
    cupGlow.push({ c, back: cup.userData.rim });
  }
  // bells: chimes, tall silver ones and squat brass ones in turn (chimeGroup)
  bells = [];
  L.bells.forEach((b, i) => {
    const c = chimeGroup(b.x, b.y, i % 2 === 0);
    boardGroup.add(c);
    bells.push({ x: b.x, y: b.y, ...c.userData.chime });
  });
  // the light and its shadow camera cover the board
  sun.position.set(w / 2 - w * 0.5, h / 2 + h * 0.9, Math.max(w, h) * 1.2);
  sun.target.position.set(w / 2, h / 2, 0);
  const sc = sun.shadow.camera, span = Math.max(w, h) * 0.85;
  sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.near = 0.5; sc.far = Math.max(w, h) * 4;
  sc.updateProjectionMatrix();
  fitCamera();
  shownWorld = null;
}

/* The plumbing round a level (L.pipes, from sim.js): copper pipes with rounded bends,
   brass flanges where they come out from under the frame, and on the feeders a valve
   wheel or a pressure gauge. They sit low enough to go in under the frame. */
const PIPE_Z = 0.15;
function plumbing(L) {
  L.pipes.forEach((pp, n) => {
    const path = new THREE.CurvePath();
    const v = (x, y) => new THREE.Vector3(x, y, PIPE_Z);
    const pts = pp.pts;
    let from = v(...pts[0]);
    for (let k = 1; k < pts.length; k++) {
      const here = v(...pts[k]);
      if (k + 1 < pts.length) {
        // a bend of radius 0.35 round each corner
        const next = v(...pts[k + 1]);
        const inDir = here.clone().sub(from).normalize(), outDir = next.clone().sub(here).normalize();
        const a = here.clone().addScaledVector(inDir, -0.35), b = here.clone().addScaledVector(outDir, 0.35);
        path.add(new THREE.LineCurve3(from, a));
        path.add(new THREE.QuadraticBezierCurve3(a, here, b));
        from = b;
      } else path.add(new THREE.LineCurve3(from, here));
    }
    const segs = Math.max(8, Math.round(path.getLength() * 12));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(path, segs, PIPE_R, 16, false), mat.copper);
    tube.castShadow = true; tube.receiveShadow = true;
    boardGroup.add(tube);
    const flange = (x, y, horizontal) => {
      const f = new THREE.Mesh(new THREE.TorusGeometry(PIPE_R + 0.02, 0.028, 8, 20), mat.brass);
      f.position.set(x, y, PIPE_Z);
      f.rotation.set(horizontal ? 0 : Math.PI / 2, horizontal ? Math.PI / 2 : 0, 0);
      boardGroup.add(f);
    };
    // brass flanges along each straight run, a cell apart
    for (let k = 0; k + 1 < pts.length; k++) {
      const [[ax, ay], [bx, by]] = [pts[k], pts[k + 1]];
      const len = Math.hypot(bx - ax, by - ay), hz = Math.abs(bx - ax) > Math.abs(by - ay);
      for (let d = 0.8; d < len - 0.5; d += 1.4) {
        const x = ax + (bx - ax) * d / len, y = ay + (by - ay) * d / len;
        if (x > -0.2 && x < L.w + 0.2 && y > -0.2 && y < L.h + 0.2) flange(x, y, hz);
      }
    }
    if (pp.cap) for (const [x, y] of [pts[0], pts[pts.length - 1]]) {
      const c = new THREE.Mesh(new THREE.SphereGeometry(PIPE_R + 0.01, 14, 10), mat.brass);
      c.position.set(x, y, PIPE_Z); boardGroup.add(c);
    }
    // a feeder gets a valve wheel or a gauge where it meets the board
    if (pp.feeder) {
      const [[ax, ay], [bx, by]] = pts;
      const inside = ax < 0 || ay < 0 || ax > L.w ? [bx, by] : [ax, ay];
      const towards = ax < 0 || ay < 0 || ax > L.w ? [ax, ay] : [bx, by];
      const u = 0.5 / Math.hypot(towards[0] - inside[0], towards[1] - inside[1]);
      const x = inside[0] + (towards[0] - inside[0]) * u * 1.6, y = inside[1] + (towards[1] - inside[1]) * u * 1.6;
      if (n % 2) boardGroup.add(valveWheel(x, y));
      else boardGroup.add(gauge(x, y, (n * 0.37) % 1));
    }
  });
}
function valveWheel(x, y) {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: '#9a2a22', roughness: 0.5, metalness: 0.3 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 8, 24), red);
  for (let k = 0; k < 3; k++) {
    const spoke = new THREE.Mesh(boxGeo, red);
    spoke.scale.set(0.34, 0.03, 0.03); spoke.rotation.z = k * Math.PI / 3;
    g.add(spoke);
  }
  const stem = new THREE.Mesh(pinGeo, mat.brass);
  stem.scale.set(0.04, 0.04, 0.16); stem.position.z = -0.08;
  g.add(rim, stem);
  g.position.set(x, y, PIPE_Z + PIPE_R + 0.1);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function gauge(x, y, reading) {
  const g = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const d = c.getContext('2d');
  d.fillStyle = '#f6efe0'; d.beginPath(); d.arc(64, 64, 64, 0, 7); d.fill();
  d.strokeStyle = '#2a2420'; d.lineCap = 'round';
  for (let k = 0; k <= 10; k++) {
    const a = Math.PI * 0.75 + (k / 10) * Math.PI * 1.5;
    d.lineWidth = k % 5 ? 1.5 : 3;
    d.beginPath(); d.moveTo(64 + Math.cos(a) * 44, 64 + Math.sin(a) * 44); d.lineTo(64 + Math.cos(a) * 55, 64 + Math.sin(a) * 55); d.stroke();
  }
  const a = Math.PI * 0.75 + (0.2 + 0.6 * reading) * Math.PI * 1.5;
  d.strokeStyle = '#1a1612'; d.lineWidth = 3;
  d.beginPath(); d.moveTo(64, 64); d.lineTo(64 + Math.cos(a) * 48, 64 + Math.sin(a) * 48); d.stroke();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.17, 28), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 }));
  face.position.z = 0.045;
  const bezel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 28), mat.brass);
  bezel.rotation.x = Math.PI / 2;
  const stem = new THREE.Mesh(pinGeo, mat.brass);
  stem.scale.set(0.04, 0.04, 0.14); stem.position.z = -0.08;
  g.add(stem, bezel, face);
  g.position.set(x, y, PIPE_Z + PIPE_R + 0.1);
  bezel.castShadow = true;
  return g;
}

// A glass bowl on a copper stand `drop` long, in cell (x, y), as a group; its rim is in
// userData so a cup can glow when it is full.
const bowlGeo = (() => {
  const bowl = [];
  for (let k = 0; k <= 16; k++) {
    const t = k / 16;
    // a round bowl: wide almost from its foot, swelling at the middle, the rim drawn in
    bowl.push(new THREE.Vector2(0.14 + 0.24 * Math.sin(Math.min(1, t * 1.6) * Math.PI / 2) - (t > 0.6 ? (t - 0.6) * 0.22 : 0), 0.1 + 0.72 * t));
  }
  return new THREE.LatheGeometry(bowl, 36);
})();
function glassCup(x, y, drop) {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(bowlGeo, mat.glass);
  glass.position.set(x + 0.5, y, MZ);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.022, 8, 36), new THREE.MeshStandardMaterial({ color: '#c8764a', metalness: 0.95, roughness: 0.3, emissive: '#000000' }));
  rim.rotation.x = Math.PI / 2; rim.position.set(x + 0.5, y + 0.82, MZ);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.1, 24), mat.copper);
  collar.position.set(x + 0.5, y + 0.06, MZ);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, drop + 0.02, 24), mat.copper);
  stand.position.set(x + 0.5, y + 0.01 - drop / 2, MZ);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.04, 24), mat.brass);
  band.position.set(x + 0.5, y - Math.min(drop, 0.3) * 0.6, MZ);
  for (const m of [collar, stand, band, rim]) m.castShadow = true;
  g.add(stand, band, collar, glass, rim);
  g.userData.rim = rim;
  return g;
}

// A chime in cell (x, y): an oak bar with a brass hammer resting on it, and a bell hung
// under it, tall silver or squat brass. userData.chime is what ringing swings.
const bellGeos = (() => {
  const bellProfile = (tall) => {
    const pts = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12;
      pts.push(tall
        ? new THREE.Vector2(0.05 + 0.04 * t + (t > 0.85 ? (t - 0.85) * 0.25 : 0), 0.3 * (1 - t))
        : new THREE.Vector2(0.03 + 0.12 * Math.pow(t, 1.6) + (t > 0.85 ? (t - 0.85) * 0.3 : 0), 0.24 * (1 - t)));
    }
    return new THREE.LatheGeometry(pts, 28);
  };
  return [bellProfile(true), bellProfile(false)];
})();
function chimeGroup(x, y, silver) {
  const g = new THREE.Group();
  const bar = new THREE.Mesh(boxGeo, mat.beam);
  bar.scale.set(0.62, 0.08, 0.14); bar.position.set(x + 0.5, y + 0.93, 0.06);
  bar.castShadow = true;
  const handle = new THREE.Mesh(boxGeo, mat.beamDark);
  handle.scale.set(0.2, 0.02, 0.02); handle.position.set(x + 0.42, y + 0.99, 0.12);
  const head = new THREE.Mesh(boxGeo, mat.brass);
  head.scale.set(0.05, 0.05, 0.05); head.position.set(x + 0.54, y + 1.0, 0.12);
  const hang = new THREE.Group();
  hang.position.set(x + 0.5, y + 0.9, DEPTH * 0.55);
  hang.scale.setScalar(1.35);
  const bell = new THREE.Mesh(bellGeos[silver ? 0 : 1], new THREE.MeshStandardMaterial({ color: silver ? '#d8d6d2' : '#dcae4c', metalness: 0.95, roughness: 0.24, emissive: '#000000' }));
  bell.position.y = silver ? -0.32 : -0.26;
  bell.castShadow = true;
  const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), mat.brass);
  clapper.position.y = silver ? -0.33 : -0.27;
  const cord = new THREE.Mesh(boxGeo, mat.iron);
  cord.scale.set(0.012, 0.06, 0.012); cord.position.y = -0.02;
  hang.add(cord, bell, clapper);
  g.add(bar, handle, head, hang);
  g.userData.chime = { hang, bell, swing: 0, t: 0, rung: false };
  return g;
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
  if (!S) return out;
  for (let i = 0; i < (tubeAt ? 1 : Math.min(L.marbles, 2)); i++) {
    const lx = S.flip ? 1 - 0.32 + i * 0.27 : 0.32 - i * 0.27;
    out.push({ x: S.x + lx, y: S.y + 0.64 + T + R + i * 0.02, a: i * 1.3, id: i });
  }
  return out;
}

// The marbles still to come, stacked up the glass feed tube from its foot: the rest of a
// level's marbles, or a few for the sandbox, which never runs out.
const TUBE_SHOWS = 3;
function queuedMarbles() {
  if (game.L.sandbox) {
    // a couple of marbles waiting in each marble release's tube
    const list = [];
    game.world.pieces.forEach((f, n) => {
      if (f.kind !== 'feeder') return;
      const dir = feederDir(game.L, f);
      for (let k = 1; k <= 2; k++) {
        const id = 1000 + n * 3 + k;
        if (dir === 'down') list.push({ x: f.x + 0.5, y: f.y + 0.75 + k * 0.3, a: id, id });
        else list.push({ x: f.x + (dir === 'right' ? 0.3 - k * 0.3 : 0.7 + k * 0.3), y: f.y + 0.5, a: id, id });
      }
    });
    return list;
  }
  if (!tubeAt) return [];
  const L = game.L, W = game.world;
  const total = L.sandbox ? Infinity : L.marbles;
  const out = game.mode === 'build' ? Math.max(0, total - 1) : Math.max(0, total - W.spawned);
  const list = [];
  for (let k = 0; k < Math.min(out, TUBE_SHOWS); k++) {
    const id = (game.mode === 'build' ? 1 : W.spawned) + k;
    list.push({ x: tubeAt.x, y: tubeAt.y + 0.05 + R + k * (2 * R + 0.01), a: id * 1.3, id });
  }
  return list;
}

function syncMarbles() {
  const W = game.world;
  const list = (game.mode === 'build' ? waitingMarbles() : W.marbles).concat(queuedMarbles());
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
    mesh.material = marbleMats[m.id % marbleMats.length];   // the sandbox's marbles come and go
    mesh.position.set(m.x, m.y, MZ + (m.rz || 0));
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
  const edge = 2 * (FRAME + FRAME_W) + 0.3;
  const bw = L.w + edge, bh = L.h + edge + 0.2;
  const tan = Math.tan((FOV / 2) * Math.PI / 180);
  const d = Math.max(bh / 2 / tan, bw / 2 / (tan * camera.aspect));
  const cx = L.w / 2, cy = L.h / 2;
  // a little from above and to the right, so the rails' tops and depth show
  camera.position.set(cx + d * 0.035, cy + d * 0.07, d);
  camera.lookAt(cx, cy, 0);
  camera.updateProjectionMatrix();
  placeStitching(wpx, hpx);
}
// The desk mat's stitching runs round the board, a little out from its frame, with the
// Release button below it: CSS draws it from where the frame's corners land on screen.
function placeStitching(wpx, hpx) {
  const L = game.L, m = FRAME + FRAME_W + 0.12;   // the frame's outer edge, then a margin
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
  if (!game.canEdit()) return;
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
  let b = bells.find((q) => q.x === x && q.y === y);
  if (!b) {
    // a chime hung in the sandbox
    const i = game.world.pieces.findIndex((p) => p.kind === 'chime' && p.x === x && p.y === y);
    b = i >= 0 && pieceMeshes[i] && pieceMeshes[i].userData.chime;
  }
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
  let extra = kind === 'spring' ? `<path d="${d}" stroke="#b8332a" stroke-width="3" transform="translate(0 -2.5)" fill="none" stroke-linecap="round"/>` : '';
  if (kind === 'wheel') extra = '<circle cx="22" cy="22" r="15.5" stroke="#e8c48c" stroke-width="1.5" fill="none"/>';
  if (kind === 'motor') extra = '<circle cx="22" cy="22" r="13" stroke="#8a8580" stroke-width="3" stroke-dasharray="3 2" fill="none"/>';
  if (kind === 'spiral') extra = '<path d="M22 6v32M12 10c10 0 20 4 0 8s10 8 0 8 20 4 0 8" stroke="#e8c48c" stroke-width="2.5" fill="none" stroke-linecap="round"/>';
  if (kind === 'plinko') extra = [[0.22, 0.8], [0.78, 0.8], [0.5, 0.5], [0.22, 0.2], [0.78, 0.2]].map(([x, y]) => `<circle cx="${4 + x * 36}" cy="${40 - y * 36}" r="3" fill="#e8c48c"/>`).join('');
  if (kind === 'bumper') extra = '<circle cx="22" cy="22" r="8" fill="#b8332a" stroke="#e8c48c" stroke-width="2"/>';
  if (kind === 'feeder') extra = '<rect x="16" y="4" width="12" height="22" rx="3" fill="rgba(200,230,240,0.35)" stroke="#e8c48c" stroke-width="1.5"/><circle cx="22" cy="12" r="4" fill="#4f7fbf"/><circle cx="22" cy="21" r="4" fill="#4f7fbf"/><path d="M14 27h16" stroke="#c8764a" stroke-width="3"/>';
  if (kind === 'crumble') extra = '<path d="M6 19h32v7H6z" fill="#a4583a"/><path d="M14 19v7M22 19v7M30 19v7" stroke="#3a2010" stroke-width="1.2"/>';
  if (kind === 'flap') extra = '<circle cx="22" cy="7" r="3" fill="#e8c48c"/>';
  if (kind === 'flipper') extra = '<circle cx="9.8" cy="28.5" r="3" fill="#e8c48c"/>';
  if (kind === 'booster') extra = '<path d="M14 21l4 2-4 2M22 23l4 2-4 2" stroke="#ff9a3c" stroke-width="2" fill="none"/>';
  if (kind === 'chime') extra = '<path d="M12 9h20M22 9v5M17 30c0-9 1-15 5-15s5 6 5 15z" stroke="#e8c48c" stroke-width="2.5" fill="rgba(232,196,140,0.35)" stroke-linejoin="round"/><circle cx="22" cy="33" r="2" fill="#e8c48c"/>';
  return `<svg viewBox="0 0 44 44" aria-hidden="true"><rect x="4" y="4" width="36" height="36" rx="3" fill="rgba(0,0,0,0.22)"/>` +
    `<path d="${d}" stroke="#e8c48c" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>${extra}</svg>`;
}

function renderBox() {
  const box = $('box');
  box.innerHTML = '';
  const kinds = ORDER.filter((k) => (game.L.give[PIECES[k].pool || k] || 0) > 0);
  $('box-title').textContent = game.L.sandbox ? 'The workshop' : 'The box';
  for (const kind of kinds) {
    const left = game.left(kind);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = ui.tool === kind ? 'on' : '';
    b.dataset.kind = kind;
    b.setAttribute('aria-pressed', ui.tool === kind ? 'true' : 'false');
    b.disabled = left <= 0 || !game.canEdit();
    b.title = PIECES[kind].tip;
    const count = left === Infinity ? '' : `<span class="count">${left}</span>`;
    b.innerHTML = `${iconSvg(kind, !!flipPref[kind])}<span>${PIECES[kind].name}</span>${count}`;
    b.addEventListener('click', () => { pickTool(ui.tool === kind ? null : kind); });
    box.appendChild(b);
  }
  $('box-sub').textContent = ui.tool ? `Tap a cell for a ${PIECES[ui.tool].name.toLowerCase()}` : 'Pick one, then a cell';
}

function starsText(st) { return st.map((s) => (s ? '★' : '☆')).join(''); }

// The level panel in the sandbox: what it is, and how many marbles the buckets have caught.
function renderSandbox() {
  if (!game.L.sandbox) return;
  const n = game.mode === 'build' ? 0 : game.world.caught;
  $('level-stars').textContent = n ? `${n} caught` : '';
}
function renderLevel() {
  const L = game.L, rec = game.record;
  document.body.classList.toggle('sandbox', L.sandbox);
  if (L.sandbox) {
    $('level-title').textContent = 'Sandbox';
    $('level-name').textContent = 'Build a contraption';
    $('level-note').textContent = L.note;
    renderSandbox();
    renderLevels();
    return;
  }
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
  const sb = document.createElement('button');
  sb.type = 'button';
  sb.className = 'sandbox-tile' + (game.idx === game.SANDBOX ? ' on' : '');
  sb.title = 'Every piece, no limits, no goal';
  sb.innerHTML = 'Sandbox<small>wheels, chimes, buckets</small>';
  sb.addEventListener('click', () => goLevel(game.SANDBOX));
  wrap.appendChild(sb);
  $('levels-sub').textContent = `${game.totalStars()} of ${game.LEVELS.length * 3} stars`;
}

function renderRun() {
  const btn = $('btn-release');
  const running = game.mode !== 'build';
  btn.textContent = game.mode === 'won' ? 'Reset' : running ? 'Stop' : 'Release';
  btn.classList.toggle('stop', running);
  $('btn-clear').disabled = !game.canEdit() || !game.placed.length;
  $('btn-hint').disabled = game.mode !== 'build';
  canvas.classList.toggle('holding', !!ui.tool && game.canEdit());
}

function renderAll() { renderBox(); renderLevel(); renderRun(); refreshFx(); placePieceBar(); }

function placePieceBar() {
  const bar = $('piece-bar');
  const p = ui.chosen && game.canEdit() ? game.at(ui.chosen.x, ui.chosen.y) : null;
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
  if (!game.canEdit()) return;
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
    ui.hint = null; ui.drag = null;
    if (!game.L.sandbox) ui.chosen = null;
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
  if (!game.canEdit()) return;
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
  if (cancelled || !game.canEdit()) { refreshFx(); return; }
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
    const kinds = ORDER.filter((k) => (game.L.give[PIECES[k].pool || k] || 0) > 0);
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
  // white noise through a narrow band: a marble on a metal-capped rail is a light whir. Dark,
  // low noise (as this was first) sounded like a carpet being dragged, worst on the slow start.
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 3;
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
  // silent while it creeps off the hopper; rises in pitch and volume once it really rolls
  roll.g.gain.setTargetAtTime(clamp((s - ROLL_QUIET) * 0.018, 0, 0.07), t, 0.06);
  roll.f.frequency.setTargetAtTime(1200 + clamp(s, 0, 8) * 260, t, 0.06);
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
    if (g.userData.spin) {
      // the wheel's own angle while it runs; a motor turns in build mode too, for show
      const sp = g.userData.spin;
      if (game.mode === 'build' && p.kind === 'motor') sp.idle += dt * MOTOR_W;
      const a = game.mode === 'build' && p.kind === 'motor' ? sp.idle : p.angle;
      sp.spinner.rotation.z = sp.sgn * a;
    }
    const ch = g.userData.chime;
    if (ch && ch.swing > 0.001) {
      ch.t += dt; ch.swing *= Math.exp(-dt * 1.6);
      ch.hang.rotation.z = Math.sin(ch.t * 11) * ch.swing;
    }
    if (g.userData.bricks) {
      for (const b of g.userData.bricks) {
        const h = b.userData.home;
        b.visible = true; b.rotation.z = 0; b.position.copy(h);
        if (p.crumble === 'shake') { b.position.x += (Math.random() - 0.5) * 0.03; b.position.y += (Math.random() - 0.5) * 0.02; }
        else if (p.crumble === 'gone') {
          // fall away, tumbling, and out of sight; back in place when it mends
          const t = CRUMBLE_GONE - p.timer;
          b.position.y = h.y - 6 * t * t; b.position.x = h.x + b.userData.drift * t;
          b.rotation.z = b.userData.spin * t;
          b.visible = t < 0.8;
        }
      }
    }
    if (g.userData.bumper) {
      const b = g.userData.boing || 0;
      g.userData.boing = Math.max(0, b - dt * 4);
      g.userData.bumper.material.emissive.setRGB(b * 0.9, b * 0.6, b * 0.2);
      g.userData.bumper.scale.set(1 + b * 0.12, 1, 1 + b * 0.12);
    }
    if (g.userData.lights) {
      const t = performance.now() / 260;
      g.userData.lights.forEach((l, k) => { l.material.emissiveIntensity = 0.2 + 1.4 * Math.max(0, Math.sin(t - k * 0.9 * (p.flip ? -1 : 1))); });
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
