/* Physics Playground: the kinetic sand tray, in three.js (vendored; this module is only
   imported the first time the tab is opened). The sim's height field is a lit mesh, and
   50,000 grains sit on it as points, each lit by the slope under it, so the surface reads
   as sand close up and every print keeps its edge. Grains thrown up by a landing fly as
   their own points until they settle back into the field. Shapes are meshes made to
   match the undersides the sim pushes into the sand. Tap to drop or lift, Poke to press
   and draw; two fingers or a right-drag turn the tray, a pinch or the wheel zooms.
   Swing hangs the sand pendulum over the tray: drag its funnel aside and let go (with a
   throw, for an ellipse), and it draws in a second colour of sand, the tray's colour two
   along, so it always shows. See sim.js for the sand. */
import * as THREE from 'three';
import { SAND_SHAPES, SAND_COLOURS } from './sim.js';

// ---------- constants ----------
const GRAINS = 50000;
const SPLASH = 2600;
const ICONS = { ball: '●', cube: '■', cylinder: '⬮', pyramid: '▲', star: '★', ring: '◯' };
const MATERIALS = {
  ball: { color: '#c9ced6', metalness: 0.85, roughness: 0.22 },
  cube: { color: '#d4a640', metalness: 0.8, roughness: 0.3 },
  cylinder: { color: '#e2483d', metalness: 0.05, roughness: 0.45 },
  pyramid: { color: '#2aa198', metalness: 0.1, roughness: 0.35 },
  star: { color: '#ffcf33', metalness: 0.15, roughness: 0.4 },
  ring: { color: '#b8c2cc', metalness: 0.9, roughness: 0.25 },
};
const LIGHT = new THREE.Vector3(-0.45, 0.85, 0.3).normalize();
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function createSandView({ sim, canvas, stage, audio, save }) {
  const N = sim.N, C = (N - 1) / 2;
  const X = (x) => x - C, Z = (z) => z - C;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#201a14');
  scene.fog = new THREE.Fog('#201a14', 260, 520);
  const camera = new THREE.PerspectiveCamera(38, 1, 1, 1200);
  const view = { az: 0.55, el: 0.92, r: 165, azTo: 0.55 };

  // ---------- a room to reflect, so brass and steel read as metal ----------
  let envTex = null;
  {
    const env = new THREE.Scene();
    const sky = new THREE.SphereGeometry(50, 32, 16);
    const c = new Float32Array(sky.attributes.position.count * 3);
    for (let i = 0; i < sky.attributes.position.count; i++) {
      const y = sky.attributes.position.getY(i) / 50;
      const k = y > 0 ? 0.55 + 0.45 * y : 0.18 + 0.2 * (1 + y);
      c[i * 3] = k * 1.0; c[i * 3 + 1] = k * 0.93; c[i * 3 + 2] = k * 0.82;
    }
    sky.setAttribute('color', new THREE.BufferAttribute(c, 3));
    env.add(new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const lamp = new THREE.Mesh(new THREE.PlaneGeometry(30, 18), new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide }));
    lamp.position.set(-20, 38, 16); lamp.lookAt(0, 0, 0); env.add(lamp);
    const pm = new THREE.PMREMGenerator(renderer);
    envTex = pm.fromScene(env, 0.03).texture;   // only the shapes reflect it; the sand stays matte
    pm.dispose();
  }

  // ---------- light ----------
  scene.add(new THREE.HemisphereLight('#fff3df', '#3a2a1e', 1.1));
  const sun = new THREE.DirectionalLight('#fff1d6', 2.2);
  sun.position.copy(LIGHT).multiplyScalar(160);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 10, far: 400 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.4;
  scene.add(sun);

  // ---------- the table and the tray ----------
  const table = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: '#5b4330', roughness: 0.85 }));
  table.rotation.x = -Math.PI / 2; table.position.y = -2; table.receiveShadow = true;
  scene.add(table);
  const wood = new THREE.MeshStandardMaterial({ color: '#c08a55', roughness: 0.6 });
  const wallH = sim.WALL, t = 4;
  for (const [w, d, x, z] of [[N + t * 2, t, 0, -C - t / 2 - 0.5], [N + t * 2, t, 0, C + t / 2 + 0.5], [t, N, -C - t / 2 - 0.5, 0], [t, N, C + t / 2 + 0.5, 0]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wood);
    m.position.set(x, wallH / 2 - 2, z); m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
  }
  const floor = new THREE.Mesh(new THREE.BoxGeometry(N + t * 2, 2, N + t * 2), wood);
  floor.position.y = -1.5; floor.receiveShadow = true; scene.add(floor);

  // ---------- the sand: a lit height field ----------
  const geo = new THREE.PlaneGeometry(N - 1, N - 1, N - 1, N - 1);
  geo.rotateX(-Math.PI / 2);
  const cols = new Float32Array(N * N * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const sandMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  const sand = new THREE.Mesh(geo, sandMat);
  sand.receiveShadow = true; sand.castShadow = true;
  scene.add(sand);

  // ---------- the grains ----------
  const gx = new Float32Array(GRAINS), gz = new Float32Array(GRAINS), gtone = new Float32Array(GRAINS);
  let seed = 4242;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < GRAINS; i++) { gx[i] = 0.6 + rnd() * (N - 2.2); gz[i] = 0.6 + rnd() * (N - 2.2); gtone[i] = 0.8 + rnd() * 0.4; }
  const gpos = new Float32Array(GRAINS * 3), gcol = new Float32Array(GRAINS * 3);
  const ggeo = new THREE.BufferGeometry();
  ggeo.setAttribute('position', new THREE.BufferAttribute(gpos, 3));
  ggeo.setAttribute('color', new THREE.BufferAttribute(gcol, 3));
  const dot = grainSprite();
  const grainMat = new THREE.PointsMaterial({ size: 0.62, sizeAttenuation: true, vertexColors: true, map: dot, alphaTest: 0.45, transparent: false });
  const grains = new THREE.Points(ggeo, grainMat);
  grains.frustumCulled = false;
  scene.add(grains);
  // grains in the air
  const spos = new Float32Array(SPLASH * 3), scol = new Float32Array(SPLASH * 3);
  const sgeo = new THREE.BufferGeometry();
  sgeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
  sgeo.setAttribute('color', new THREE.BufferAttribute(scol, 3));
  const splash = new THREE.Points(sgeo, new THREE.PointsMaterial({ size: 0.8, sizeAttenuation: true, vertexColors: true, map: dot, alphaTest: 0.45 }));
  splash.frustumCulled = false;
  scene.add(splash);

  function grainSprite() {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, '#fff'); gr.addColorStop(0.65, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(16, 16, 16, 0, Math.PI * 2); g.fill();
    const tex = new THREE.CanvasTexture(c);
    return tex;
  }

  // ---------- painting the sand ----------
  let ver = -1, colourDone = -1;
  function paintSand() {
    if (ver === sim.ver && colourDone === sim.colour) return;
    ver = sim.ver; colourDone = sim.colour;
    const h = sim.h, P = geo.attributes.position.array;
    const base = SAND_COLOURS[sim.colour].rgb.map((v) => v / 255), ink = tintColour();
    const tint = sim.tint;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const i = z * N + x;
      P[i * 3 + 1] = h[i];
      // darker in hollows, a touch lighter on crests: the shape reads even in flat light
      const l = x > 0 && x < N - 1 && z > 0 && z < N - 1 ? (h[i - 1] + h[i + 1] + h[i - N] + h[i + N]) / 4 - h[i] : 0;
      const k = clamp(1 - l * 0.35, 0.72, 1.12), t = tint[i];
      cols[i * 3] = (base[0] + (ink[0] - base[0]) * t) * k; cols[i * 3 + 1] = (base[1] + (ink[1] - base[1]) * t) * k; cols[i * 3 + 2] = (base[2] + (ink[2] - base[2]) * t) * k;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    // the grains ride the surface, lit by the slope under each
    for (let i = 0; i < GRAINS; i++) {
      const x = gx[i], z = gz[i];
      const y = sim.heightAt(x, z);
      const dx = sim.heightAt(x + 0.5, z) - sim.heightAt(x - 0.5, z), dz = sim.heightAt(x, z + 0.5) - sim.heightAt(x, z - 0.5);
      const nl = Math.hypot(dx, 1, dz);
      const lit = 0.5 + 0.7 * Math.max(0, (-dx * LIGHT.x + LIGHT.y - dz * LIGHT.z) / nl);
      const k = lit * gtone[i];
      gpos[i * 3] = X(x); gpos[i * 3 + 1] = y + 0.18; gpos[i * 3 + 2] = Z(z);
      const t = tint[Math.round(z) * N + Math.round(x)] || 0;
      gcol[i * 3] = Math.min(1, (base[0] + (ink[0] - base[0]) * t) * k); gcol[i * 3 + 1] = Math.min(1, (base[1] + (ink[1] - base[1]) * t) * k); gcol[i * 3 + 2] = Math.min(1, (base[2] + (ink[2] - base[2]) * t) * k);
    }
    ggeo.attributes.position.needsUpdate = true;
    ggeo.attributes.color.needsUpdate = true;
  }
  // the pendulum's sand: the tray's colour two along, darkened a little so it always shows
  function tintColour() { return SAND_COLOURS[(sim.colour + 2) % SAND_COLOURS.length].rgb.map((v) => v / 255 * 0.8); }

  // ---------- the sand pendulum ----------
  const PIVOT_Y = 240, FUNNEL_Y = 30, STREAM = 70;
  const swingGroup = new THREE.Group();
  const brass = new THREE.MeshStandardMaterial({ color: '#c9a24a', metalness: 0.85, roughness: 0.3, envMap: envTex, envMapIntensity: 1.1, side: THREE.DoubleSide });
  const funnelGeo = new THREE.ConeGeometry(4.2, 8, 32, 1, true);
  funnelGeo.rotateX(Math.PI);
  const funnel = new THREE.Mesh(funnelGeo, brass);
  funnel.castShadow = true;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.35, 8, 40), brass);
  rim.rotation.x = Math.PI / 2; rim.position.y = 4;
  const fill = new THREE.Mesh(new THREE.CircleGeometry(3.9, 32), new THREE.MeshStandardMaterial({ roughness: 1 }));
  fill.rotation.x = -Math.PI / 2;
  const bob = new THREE.Group();
  bob.add(funnel, rim, fill);
  const stringGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(15), 3));
  const strings = new THREE.Line(stringGeo, new THREE.LineBasicMaterial({ color: '#3b2f25' }));
  strings.frustumCulled = false;
  const streamPos = new Float32Array(STREAM * 3), streamCol = new Float32Array(STREAM * 3), streamT = new Float32Array(STREAM);
  for (let i = 0; i < STREAM; i++) streamT[i] = i / STREAM;
  const streamGeo = new THREE.BufferGeometry();
  streamGeo.setAttribute('position', new THREE.BufferAttribute(streamPos, 3));
  streamGeo.setAttribute('color', new THREE.BufferAttribute(streamCol, 3));
  const stream = new THREE.Points(streamGeo, new THREE.PointsMaterial({ size: 0.55, sizeAttenuation: true, vertexColors: true, map: dot, alphaTest: 0.45 }));
  stream.frustumCulled = false;
  swingGroup.add(bob, strings, stream);
  swingGroup.visible = false;
  scene.add(swingGroup);
  function paintSwing(dt) {
    const w = sim.swing;
    swingGroup.visible = w.on;
    if (!w.on) return;
    const fx = X(w.x), fz = Z(w.z);
    bob.position.set(fx, FUNNEL_Y, fz);
    // a Y of string: two cords from the ceiling meet in a knot, and one goes on down
    const p = stringGeo.attributes.position.array, ky = FUNNEL_Y + 90;
    const kx = fx * 0.62, kz = fz * 0.62;
    p.set([-70, PIVOT_Y, kz * 0.3, kx, ky, kz, 70, PIVOT_Y, kz * 0.3, kx, ky, kz, fx, FUNNEL_Y + 4, fz]);
    stringGeo.attributes.position.needsUpdate = true;
    const ink = tintColour(), full = w.load / 900;
    fill.position.y = 4 - 7 * (1 - full); fill.scale.setScalar(Math.max(0.05, 0.25 + 0.75 * full));
    fill.material.color.setRGB(ink[0] * 1.1, ink[1] * 1.1, ink[2] * 1.1);
    fill.visible = full > 0.01;
    const flowing = !w.held && w.load > 0;
    const ground = sim.heightAt(w.x, w.z);
    for (let i = 0; i < STREAM; i++) {
      streamT[i] = (streamT[i] + dt * 2.2) % 1;
      const t = streamT[i], y = FUNNEL_Y - 4 - t * t * (FUNNEL_Y - 4 - ground);
      // grains already falling lag behind a moving funnel
      streamPos[i * 3] = fx - w.vx * t * 0.25 + Math.sin(i * 12.9) * 0.15;
      streamPos[i * 3 + 1] = flowing ? y : -100;
      streamPos[i * 3 + 2] = fz - w.vz * t * 0.25 + Math.cos(i * 7.3) * 0.15;
      streamCol[i * 3] = ink[0]; streamCol[i * 3 + 1] = ink[1]; streamCol[i * 3 + 2] = ink[2];
    }
    streamGeo.attributes.position.needsUpdate = true; streamGeo.attributes.color.needsUpdate = true;
  }

  function paintSplash() {
    const base = SAND_COLOURS[sim.colour].rgb.map((v) => v / 255);
    const n = Math.min(SPLASH, sim.grains.length);
    for (let i = 0; i < n; i++) {
      const g = sim.grains[i];
      spos[i * 3] = X(g.x); spos[i * 3 + 1] = g.y; spos[i * 3 + 2] = Z(g.z);
      const k = 0.85 + (i % 7) * 0.05;
      scol[i * 3] = base[0] * k; scol[i * 3 + 1] = base[1] * k; scol[i * 3 + 2] = base[2] * k;
    }
    sgeo.setDrawRange(0, n);
    sgeo.attributes.position.needsUpdate = true;
    sgeo.attributes.color.needsUpdate = true;
  }

  // ---------- shapes ----------
  const meshes = new Map();
  const geos = {}, mats = {};
  function geometry(kind, size) {
    const key = kind + size;
    if (geos[key]) return geos[key];
    let g;
    const R = size;
    if (kind === 'ball') { g = new THREE.SphereGeometry(R, 40, 24); g.translate(0, R, 0); }
    else if (kind === 'cube') { g = new THREE.BoxGeometry(R, R, R); g.translate(0, R / 2, 0); }
    else if (kind === 'cylinder') { g = new THREE.CylinderGeometry(R, R, R * 0.8, 40); g.translate(0, R * 0.4, 0); }
    else if (kind === 'pyramid') { g = new THREE.ConeGeometry(R / Math.SQRT2, R, 4); g.rotateY(Math.PI / 4); g.translate(0, R / 2, 0); }
    else if (kind === 'star') {
      // tips where the sim's footprint has them: at 36°, then every 72°. The shape is
      // drawn in x, -z because laying it flat turns its y into the world's -z.
      const s = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const a = i * Math.PI / 5, r = i % 2 ? R : R * 0.42;
        if (i) s.lineTo(Math.cos(a) * r, -Math.sin(a) * r); else s.moveTo(Math.cos(a) * r, -Math.sin(a) * r);
      }
      g = new THREE.ExtrudeGeometry(s, { depth: R * 0.55, bevelEnabled: true, bevelSize: 0.6, bevelThickness: 0.6, bevelSegments: 2 });
      g.rotateX(-Math.PI / 2);
      g.translate(0, 0.6, 0);
    } else { g = new THREE.TorusGeometry(R * 0.72, R * 0.38, 20, 48); g.rotateX(Math.PI / 2); g.translate(0, R * 0.38, 0); }
    geos[key] = g;
    return g;
  }
  function material(kind) {
    if (!mats[kind]) mats[kind] = new THREE.MeshStandardMaterial({ ...MATERIALS[kind], envMap: envTex, envMapIntensity: 1.1 });
    return mats[kind];
  }
  function syncShapes() {
    const live = new Set();
    for (const s of sim.shapes) {
      live.add(s.id);
      let m = meshes.get(s.id);
      if (!m) {
        m = new THREE.Mesh(geometry(s.kind, s.size), material(s.kind));
        m.castShadow = true; m.receiveShadow = true;
        m.userData.id = s.id;
        scene.add(m); meshes.set(s.id, m);
      }
      m.position.set(X(s.x), s.y, Z(s.z));
      m.rotation.y = -s.yaw;
    }
    for (const [id, m] of meshes) if (!live.has(id)) { scene.remove(m); meshes.delete(id); }
  }

  // ---------- camera ----------
  function placeCamera() {
    view.az += (view.azTo - view.az) * 0.18;
    const tgt = new THREE.Vector3(0, 8, 4);
    camera.position.set(tgt.x + view.r * Math.cos(view.el) * Math.sin(view.az), tgt.y + view.r * Math.sin(view.el), tgt.z + view.r * Math.cos(view.el) * Math.cos(view.az));
    camera.lookAt(tgt);
  }
  function resize() {
    const r = stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    // a tall screen pulls back so the whole tray fits across
    camera.fov = r.width / r.height < 1 ? 38 / Math.max(0.55, r.width / r.height) : 38;
    camera.updateProjectionMatrix();
  }

  let lastDraw = performance.now();
  function draw() {
    const now = performance.now(), dt = Math.min(0.1, (now - lastDraw) / 1000);
    lastDraw = now;
    paintSand();
    paintSplash();
    paintSwing(dt);
    syncShapes();
    placeCamera();
    renderer.render(scene, camera);
  }

  // ---------- input ----------
  let kind = 'ball', tool = 'drop';
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(e, sandOnly = false) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (sandOnly) { const hit = ray.intersectObject(sand, false)[0]; return hit ? { x: hit.point.x + C, z: hit.point.z + C } : null; }
    const shapeHits = ray.intersectObjects([...meshes.values()], false);
    if (shapeHits.length) return { shape: shapeHits[0].object.userData.id };
    const hit = ray.intersectObject(sand, false)[0];
    if (!hit) return null;
    return { x: hit.point.x + C, z: hit.point.z + C };
  }
  const pointers = new Map();
  let gesture = null, lastPoke = null;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.preventDefault();
    if (pointers.size >= 2) { gesture = { kind: 'orbit2', d: spread(), mx: mid().x }; lastPoke = null; return; }
    if (e.button === 2 || e.shiftKey) { gesture = { kind: 'orbit', x: e.clientX }; return; }
    if (tool === 'swing') {
      const q = pick(e, true);
      gesture = { kind: 'swing', trail: [] };
      if (q) { sim.swingHold(q.x, q.z); gesture.trail.push({ x: q.x, z: q.z, t: performance.now() }); }
      return;
    }
    const p = pick(e);
    gesture = { kind: 'act' };
    if (!p) return;
    if (p.shape != null) { sim.lift(p.shape); return; }
    if (tool === 'drop') sim.drop(kind, p.x, p.z);
    else { sim.press(p.x, p.z, 3.2, 2.4); lastPoke = p; }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gesture) return;
    if (gesture.kind === 'swing') {
      const q = pick(e, true);
      if (!q) return;
      sim.swingHold(q.x, q.z);
      gesture.trail.push({ x: q.x, z: q.z, t: performance.now() });
      if (gesture.trail.length > 8) gesture.trail.shift();
    } else if (gesture.kind === 'orbit') { view.azTo -= (e.clientX - gesture.x) * 0.008; gesture.x = e.clientX; }
    else if (gesture.kind === 'orbit2' && pointers.size >= 2) {
      const m = mid(), d = spread();
      view.azTo -= (m.x - gesture.mx) * 0.008; gesture.mx = m.x;
      view.r = clamp(view.r * gesture.d / Math.max(1, d), 70, 280); gesture.d = d;
    } else if (gesture.kind === 'act' && tool === 'poke' && lastPoke) {
      const p = pick(e);
      if (!p || p.shape != null) return;
      // a groove: press every unit along the way
      const dx = p.x - lastPoke.x, dz = p.z - lastPoke.z, d = Math.hypot(dx, dz);
      for (let s = 1; s <= d; s += 1) sim.press(lastPoke.x + dx * s / d, lastPoke.z + dz * s / d, 2.6, 1.2);
      if (d >= 1) lastPoke = p;
    }
  });
  // let the funnel go with the speed it was being moved at over the last moment
  function letSwing(gs) {
    const tr = gs.trail, now = performance.now();
    const cur = tr[tr.length - 1];
    if (!cur) { sim.swingLet(0, 0); return; }
    const old = tr.find((p) => now - p.t < 120) || cur;
    const dt = Math.max(0.016, (cur.t - old.t) / 1000);
    sim.swingLet(old === cur ? 0 : (cur.x - old.x) / dt, old === cur ? 0 : (cur.z - old.z) / dt);
  }
  const end = (e) => { if (gesture && gesture.kind === 'swing') letSwing(gesture); pointers.delete(e.pointerId); if (!pointers.size) { gesture = null; lastPoke = null; } else if (pointers.size === 1) gesture = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); view.r = clamp(view.r * (1 + Math.sign(e.deltaY) * 0.08), 70, 280); }, { passive: false });
  function spread() { const [a, b] = [...pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); }
  function mid() { const [a, b] = [...pointers.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
  function key(e, isDown) {
    if (!isDown) return false;
    if (e.key === 'ArrowLeft') { view.azTo += 0.3; return true; }
    if (e.key === 'ArrowRight') { view.azTo -= 0.3; return true; }
    return false;
  }

  // ---------- sound ----------
  let lastPress = 0;
  function event(name, d) {
    if (name === 'land') {
      const v = clamp(d.speed / 260, 0, 1);
      audio.noise({ dur: 0.22, vol: 0.06 + 0.16 * v, filter: 'lowpass', freq: 380 + 500 * v, to: 140 });
      audio.tone({ freq: 90, to: 50, dur: 0.18, type: 'sine', vol: 0.08 + 0.12 * v });
      audio.noise({ dur: 0.35, vol: 0.03 * v, filter: 'bandpass', freq: 3000, q: 0.6, delay: 0.04 });
    } else if (name === 'press') {
      const now = performance.now();
      if (now - lastPress > 70) { lastPress = now; audio.noise({ dur: 0.09, vol: 0.035, filter: 'lowpass', freq: 900 }); }
    } else if (name === 'lift') {
      audio.tone({ freq: 240, to: 520, dur: 0.12, type: 'sine', vol: 0.05 });
      audio.noise({ dur: 0.1, vol: 0.03, filter: 'bandpass', freq: 1500 });
    } else if (name === 'fill') audio.noise({ dur: 0.4, vol: 0.04, filter: 'bandpass', freq: 2200, q: 0.7 });
    else if (name === 'rake') audio.noise({ dur: 0.6, vol: 0.05, filter: 'bandpass', freq: 1800, to: 900, q: 0.5 });
  }

  // ---------- controls ----------
  const shapeBox = document.getElementById('sd-shapes');
  for (const [k, def] of Object.entries(SAND_SHAPES)) {
    const b = document.createElement('button');
    b.textContent = ICONS[k]; b.title = def.name; b.setAttribute('aria-label', def.name);
    b.addEventListener('click', () => { kind = k; setTool('drop'); syncShapes2(); });
    shapeBox.appendChild(b);
  }
  function syncShapes2() { [...shapeBox.children].forEach((b, i) => b.setAttribute('aria-pressed', String(Object.keys(SAND_SHAPES)[i] === kind))); }
  syncShapes2();
  const toolBtns = { drop: document.getElementById('sd-drop'), poke: document.getElementById('sd-poke'), swing: document.getElementById('sd-swing') };
  const ratioBox = document.getElementById('sd-ratio-box');
  function setTool(t) {
    tool = t;
    for (const [k, b] of Object.entries(toolBtns)) b.setAttribute('aria-pressed', String(k === t));
    // the pendulum hangs while its tool is in hand, and is lifted away with it
    sim.hangSwing(t === 'swing');
    ratioBox.hidden = t !== 'swing';
  }
  for (const [k, b] of Object.entries(toolBtns)) b.addEventListener('click', () => setTool(k));
  const ratio = document.getElementById('sd-ratio');
  ratio.value = sim.swing.ratio;
  ratio.addEventListener('input', () => { sim.setRatio(ratio.value); save(); });
  const colourBox = document.getElementById('sd-colours');
  SAND_COLOURS.forEach((c, i) => {
    const b = document.createElement('button');
    b.style.background = `rgb(${c.rgb.join(',')})`; b.title = c.name; b.setAttribute('aria-label', c.name + ' sand');
    b.addEventListener('click', () => { sim.colour = i; syncColours(); save(); });
    colourBox.appendChild(b);
  });
  function syncColours() { [...colourBox.children].forEach((b, i) => b.setAttribute('aria-pressed', String(i === sim.colour))); }
  syncColours();
  const wet = document.getElementById('sd-wet');
  wet.value = sim.wet;
  wet.addEventListener('input', () => { sim.setWet(wet.value); save(); });
  document.getElementById('sd-left').addEventListener('click', () => { view.azTo += Math.PI / 6; });
  document.getElementById('sd-right').addEventListener('click', () => { view.azTo -= Math.PI / 6; });
  document.getElementById('sd-rake').addEventListener('click', () => sim.rake());

  function show() { resize(); syncColours(); wet.value = sim.wet; ratio.value = sim.swing.ratio; }
  return { draw, resize, show, key, event, setTool, view, renderer, pick, get kind() { return kind; }, set kind(k) { kind = k; syncShapes2(); } };
}
